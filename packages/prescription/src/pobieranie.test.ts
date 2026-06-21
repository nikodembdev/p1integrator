import { generateKeyPairSync } from "node:crypto";
import type { CallContext, HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import {
  type PrescriptionQueryTransport,
  readPrescription,
  searchPatientPrescriptions,
} from "./pobieranie.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

const context: CallContext = {
  subject: { root: "1.2.3", extension: "P" },
  user: { root: "1.2.4", extension: "U" },
  workplace: { root: "1.2.5", extension: "M" },
  businessRole: "DOCTOR",
};

const transportWith = (httpClient: HttpClient): PrescriptionQueryTransport => ({
  context,
  httpClient,
  wsSecurityCertificate: { privateKeyPem, certificateBase64: "ZHVtbXk=" },
  endpoint: "https://p1.example/ObslugaReceptyWS",
  clock: { now: () => new Date("2026-01-01T00:00:00Z") },
});

const SOAP_NS = 'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"';

const searchResponse =
  `<soap:Envelope ${SOAP_NS}><soap:Body><WyszukanieReceptUslugobiorcyResponse>` +
  `<wynikiWyszukiwaniaReceptUslugobiorcy>` +
  `<wynikWyszukiwaniaReceptUslugobiorcy>` +
  `<kluczRecepty>RX-KEY-1</kluczRecepty><kluczPakietu>PKG-1</kluczPakietu>` +
  `<dataWystawieniaRecepty>2026-05-01T10:00:00.000Z</dataWystawieniaRecepty>` +
  `<numerRecepty><extension>NR-1</extension><root>2.16.840.1.113883.3.4424.2.7.999.2</root></numerRecepty>` +
  `<statusRecepty>WYSTAWIONA</statusRecepty>` +
  `<podmiotNazwa>Przychodnia</podmiotNazwa><wystawcaNazwa>Adam Leczniczy</wystawcaNazwa>` +
  `<identyfikatorPracownikaWystawcy><extension>1234567</extension><root>2.16.840.1.113883.3.4424.1.6.2</root></identyfikatorPracownikaWystawcy>` +
  `</wynikWyszukiwaniaReceptUslugobiorcy>` +
  `<wynikWyszukiwaniaReceptUslugobiorcy>` +
  `<kluczRecepty>RX-KEY-2</kluczRecepty><kluczPakietu>PKG-2</kluczPakietu>` +
  `<statusRecepty>ZREALIZOWANA</statusRecepty>` +
  `</wynikWyszukiwaniaReceptUslugobiorcy>` +
  `</wynikiWyszukiwaniaReceptUslugobiorcy>` +
  `<wynik><major>urn:csioz:p1:kod:major:Sukces</major><komunikat>OK</komunikat></wynik>` +
  `</WyszukanieReceptUslugobiorcyResponse></soap:Body></soap:Envelope>`;

describe("searchPatientPrescriptions", () => {
  it("buduje kopertę wyszukanieReceptUslugobiorcy z kryteriami i parsuje listę", async () => {
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (request) => {
        captured = request;
        return Promise.resolve({ status: 200, headers: {}, body: searchResponse });
      },
    };

    const result = await searchPatientPrescriptions(
      {
        pesel: "40010151673",
        status: "WYSTAWIONA",
        issuedFrom: new Date("2026-01-01T00:00:00Z"),
        issuedTo: new Date("2026-06-01T00:00:00Z"),
        practitionerNpwz: "1234567",
      },
      transportWith(client),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.prescriptions).toHaveLength(2);
      const first = result.value.prescriptions[0];
      expect(first?.prescriptionKey).toBe("RX-KEY-1");
      expect(first?.packageKey).toBe("PKG-1");
      expect(first?.status).toBe("WYSTAWIONA");
      expect(first?.prescriptionNumber?.extension).toBe("NR-1");
      expect(first?.issuerName).toBe("Adam Leczniczy");
      expect(first?.issuerNpwz).toBe("1234567");
      expect(result.value.prescriptions[1]?.prescriptionKey).toBe("RX-KEY-2");
      expect(result.value.outcome?.major).toBe("urn:csioz:p1:kod:major:Sukces");
    }

    expect(captured?.headers.SOAPAction).toBe("urn:wyszukanieReceptUslugobiorcy");
    expect(captured?.body).toContain("WyszukanieReceptUslugobiorcyRequest");
    expect(captured?.body).toContain("<kryteriaWyszukiwaniaReceptUslugobiorcy>");
    // PESEL jako idUslugobiorcy (extension przed root - kolejność z XSD)
    expect(captured?.body).toContain(
      "<r:idUslugobiorcy><wsp:extension>40010151673</wsp:extension>" +
        "<wsp:root>2.16.840.1.113883.3.4424.1.1.616</wsp:root></r:idUslugobiorcy>",
    );
    expect(captured?.body).toContain("<r:statusRecepty>WYSTAWIONA</r:statusRecepty>");
    expect(captured?.body).toContain("<r:dataWystawieniaReceptyOd>2026-01-01T00:00:00.000Z");
    expect(captured?.body).toContain("<r:idPracownikaMedycznego>");
  });

  it("wymaga tylko PESEL (pozostałe kryteria pomijane)", async () => {
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (request) => {
        captured = request;
        return Promise.resolve({ status: 200, headers: {}, body: searchResponse });
      },
    };
    await searchPatientPrescriptions({ pesel: "40010151673" }, transportWith(client));
    expect(captured?.body).not.toContain("statusRecepty");
    expect(captured?.body).not.toContain("dataWystawieniaRecepty");
    expect(captured?.body).not.toContain("idPracownikaMedycznego");
  });

  it("mapuje błąd sieci na błąd transportu", async () => {
    const client: HttpClient = { send: () => Promise.reject(new Error("ECONNREFUSED")) };
    const result = await searchPatientPrescriptions({ pesel: "1" }, transportWith(client));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("transport");
  });
});

const cdaXml = "<ClinicalDocument><id/></ClinicalDocument>";
const readResponse =
  `<soap:Envelope ${SOAP_NS}><soap:Body><OdczytReceptyResponse>` +
  `<receptaIWynikWeryfikacji><statusRecepty>WYSTAWIONA</statusRecepty>` +
  `<recepta><identyfikatorDokumentuWPakiecie>1</identyfikatorDokumentuWPakiecie>` +
  `<tresc>${Buffer.from(cdaXml, "utf8").toString("base64")}</tresc></recepta>` +
  `</receptaIWynikWeryfikacji>` +
  `<wynik><major>urn:csioz:p1:kod:major:Sukces</major></wynik>` +
  `</OdczytReceptyResponse></soap:Body></soap:Envelope>`;

describe("readPrescription", () => {
  it("buduje kopertę odczytRecepty i dekoduje treść CDA z base64", async () => {
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (request) => {
        captured = request;
        return Promise.resolve({ status: 200, headers: {}, body: readResponse });
      },
    };

    const result = await readPrescription("RX-KEY-1", transportWith(client));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("WYSTAWIONA");
      expect(result.value.documentIdInPackage).toBe("1");
      expect(result.value.cdaXml).toBe(cdaXml);
    }

    expect(captured?.headers.SOAPAction).toBe("urn:odczytRecepty");
    expect(captured?.body).toContain(
      "<kluczRecepty><r:kluczRecepty>RX-KEY-1</r:kluczRecepty></kluczRecepty>",
    );
  });

  it("mapuje błąd sieci na błąd transportu", async () => {
    const client: HttpClient = { send: () => Promise.reject(new Error("ECONNREFUSED")) };
    const result = await readPrescription("K", transportWith(client));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("transport");
  });
});
