import { generateKeyPairSync } from "node:crypto";
import type { CallContext, HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import {
  type PrescriptionQueryTransport,
  readCancellationDocument,
  readFulfillmentDocument,
  readPackageAccessData,
  readPatientPrescriptionKeys,
  readPrescription,
  readPrescriptionFulfillmentState,
  readPrescriptionPackage,
  searchCancellationDocuments,
  searchFulfillmentDocuments,
  searchIssuerPrescriptions,
  searchPatientPrescriptions,
  searchPatientPrescriptionsExtended,
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

// Klient przechwytujący żądanie i zwracający podaną odpowiedź.
function capturing(responseBody: string): {
  client: HttpClient;
  req: () => HttpRequest | undefined;
} {
  let captured: HttpRequest | undefined;
  return {
    client: {
      send: (request) => {
        captured = request;
        return Promise.resolve({ status: 200, headers: {}, body: responseBody });
      },
    },
    req: () => captured,
  };
}

const okWynik = "<wynik><major>urn:csioz:p1:kod:major:Sukces</major></wynik>";
const env = (inner: string): string =>
  `<soap:Envelope ${SOAP_NS}><soap:Body>${inner}</soap:Body></soap:Envelope>`;

describe("searchPatientPrescriptionsExtended", () => {
  const response = env(
    `<RozszerzoneWyszukiwanieReceptUslugobiorcyResponse><wynikiRozszerzonegoWyszukiwaniaReceptUslugobiorcy>` +
      `<wynikRozszerzonegoWyszukiwaniaReceptUslugobiorcy>` +
      `<dataWystawieniaRecepty>2026-05-01T10:00:00.000Z</dataWystawieniaRecepty>` +
      `<kluczRecepty>RX-1</kluczRecepty><nazwaPrzepisanegoLeku>Zofran</nazwaPrzepisanegoLeku>` +
      `<numerRecepty><extension>NR-1</extension><root>R</root></numerRecepty>` +
      `<statusMozliwosciRealizacjiRecepty>true</statusMozliwosciRealizacjiRecepty>` +
      `<statusRecepty>WYSTAWIONA</statusRecepty>` +
      `</wynikRozszerzonegoWyszukiwaniaReceptUslugobiorcy>` +
      `<liczbaDokumentow>42</liczbaDokumentow>` +
      `</wynikiRozszerzonegoWyszukiwaniaReceptUslugobiorcy>${okWynik}</RozszerzoneWyszukiwanieReceptUslugobiorcyResponse>`,
  );

  it("buduje kryteria ze stronicowaniem i parsuje listę + liczbę", async () => {
    const { client, req } = capturing(response);
    const result = await searchPatientPrescriptionsExtended(
      {
        pesel: "401",
        drugName: "Zofran",
        paging: { pageSize: 20, pageNumber: 0, sort: "MALEJACO", includeCount: true },
      },
      transportWith(client),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalCount).toBe(42);
      expect(result.value.prescriptions[0]?.prescriptionKey).toBe("RX-1");
      expect(result.value.prescriptions[0]?.drugName).toBe("Zofran");
      expect(result.value.prescriptions[0]?.fulfillable).toBe(true);
    }
    expect(req()?.headers.SOAPAction).toBe("urn:rozszerzoneWyszukiwanieReceptUslugobiorcy");
    expect(req()?.body).toContain("<r:nazwaLeku>Zofran</r:nazwaLeku>");
    expect(req()?.body).toContain("<wsp:rozmiarStrony>20</wsp:rozmiarStrony>");
    expect(req()?.body).toContain("<wsp:kierunekSortowania>MALEJACO</wsp:kierunekSortowania>");
  });
});

describe("readPatientPrescriptionKeys", () => {
  const response = env(
    `<OdczytKluczyReceptUslugobiorcyResponse><wynikiWyszukiwaniaKluczyReceptUslugobiorcy>` +
      `<wynikWyszukiwaniaKluczyReceptUslugobiorcy>` +
      `<kluczRecepty>RX-1</kluczRecepty><dataWystawienia>2026-05-01T10:00:00.000Z</dataWystawienia>` +
      `<imieNazwiskoWystawcy>Adam Leczniczy</imieNazwiskoWystawcy><nazwaLeku>Zofran</nazwaLeku><status>WYSTAWIONA</status>` +
      `</wynikWyszukiwaniaKluczyReceptUslugobiorcy>` +
      `</wynikiWyszukiwaniaKluczyReceptUslugobiorcy>${okWynik}</OdczytKluczyReceptUslugobiorcyResponse>`,
  );

  it("parsuje klucze i przekazuje podpisany dokument, gdy podany", async () => {
    const { client, req } = capturing(response);
    const result = await readPatientPrescriptionKeys(transportWith(client), "QkFTRTY0");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.keys[0]?.prescriptionKey).toBe("RX-1");
      expect(result.value.keys[0]?.drugName).toBe("Zofran");
    }
    expect(req()?.headers.SOAPAction).toBe("urn:odczytKluczyReceptUslugobiorcy");
    expect(req()?.body).toContain("<r:podpisanyDokument>QkFTRTY0</r:podpisanyDokument>");
  });

  it("pomija podpisanyDokument, gdy nie podano", async () => {
    const { client, req } = capturing(response);
    await readPatientPrescriptionKeys(transportWith(client));
    expect(req()?.body).not.toContain("podpisanyDokument");
  });
});

describe("searchIssuerPrescriptions", () => {
  const response = env(
    `<WyszukanieReceptWystawiajacegoResponse><wynikiWyszukiwaniaRecept>` +
      `<wynikWyszukiwaniaRecept><kluczRecepty>RX-9</kluczRecepty><kluczPakietu>PKG-9</kluczPakietu>` +
      `<dataWystawieniaRecepty>2026-05-01T10:00:00.000Z</dataWystawieniaRecepty>` +
      `<numerRecepty><extension>NR-9</extension><root>R</root></numerRecepty><statusRecepty>WYSTAWIONA</statusRecepty>` +
      `</wynikWyszukiwaniaRecept></wynikiWyszukiwaniaRecept>${okWynik}</WyszukanieReceptWystawiajacegoResponse>`,
  );

  it("buduje kryteria po NPWZ i parsuje listę", async () => {
    const { client, req } = capturing(response);
    const result = await searchIssuerPrescriptions(
      { practitionerNpwz: "1234567" },
      transportWith(client),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.prescriptions[0]?.prescriptionKey).toBe("RX-9");
    expect(req()?.headers.SOAPAction).toBe("urn:wyszukanieReceptWystawiajacego");
    expect(req()?.body).toContain("<kryteriaWyszukiwaniaRecept>");
    expect(req()?.body).toContain("<r:idPracownikaMedycznego>");
  });
});

describe("readPrescriptionPackage", () => {
  const cda = "<ClinicalDocument/>";
  const response = env(
    `<OdczytPakietuReceptResponse><pakietReceptIWynikowWeryfikacji>` +
      `<receptaIWynikWeryfikacji><statusRecepty>WYSTAWIONA</statusRecepty>` +
      `<recepta><identyfikatorDokumentuWPakiecie>1</identyfikatorDokumentuWPakiecie>` +
      `<tresc>${Buffer.from(cda, "utf8").toString("base64")}</tresc></recepta></receptaIWynikWeryfikacji>` +
      `</pakietReceptIWynikowWeryfikacji>${okWynik}</OdczytPakietuReceptResponse>`,
  );

  it("odczytuje pakiet i dekoduje treści CDA", async () => {
    const { client, req } = capturing(response);
    const result = await readPrescriptionPackage("PKG-1", transportWith(client));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.prescriptions[0]?.status).toBe("WYSTAWIONA");
      expect(result.value.prescriptions[0]?.cdaXml).toBe(cda);
    }
    expect(req()?.headers.SOAPAction).toBe("urn:odczytPakietuRecept");
    expect(req()?.body).toContain(
      "<kluczPakietuRecept><r:kluczPakietuRecept>PKG-1</r:kluczPakietuRecept></kluczPakietuRecept>",
    );
  });
});

describe("readPackageAccessData", () => {
  const response = env(
    `<OdczytDanychDostepowychPakietuReceptResponse><kodIKluczePakietuIRecept>` +
      `<kluczeINumeryRecept><kluczINumerRecepty><kluczRecepty>RX-1</kluczRecepty>` +
      `<numerRecepty><extension>NR-1</extension><root>R</root></numerRecepty></kluczINumerRecepty></kluczeINumeryRecept>` +
      `<kluczIKodPakietuRecept><kluczPakietuRecept>PKG-1</kluczPakietuRecept><kodPakietuRecept>1234</kodPakietuRecept></kluczIKodPakietuRecept>` +
      `</kodIKluczePakietuIRecept>${okWynik}</OdczytDanychDostepowychPakietuReceptResponse>`,
  );

  it("parsuje klucz/kod pakietu oraz klucze recept", async () => {
    const { client, req } = capturing(response);
    const result = await readPackageAccessData("RX-1", transportWith(client));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.packageKey).toBe("PKG-1");
      expect(result.value.packageCode).toBe("1234");
      expect(result.value.prescriptions[0]?.prescriptionKey).toBe("RX-1");
      expect(result.value.prescriptions[0]?.prescriptionNumber?.extension).toBe("NR-1");
    }
    expect(req()?.headers.SOAPAction).toBe("urn:odczytDanychDostepowychPakietuRecept");
  });
});

describe("readPrescriptionFulfillmentState", () => {
  const response = env(
    `<OdczytStanuRealizacjiReceptyResponse><stanRealizacjiRecepty>` +
      `<dataWydawaniaProduktuOd>2026-05-01</dataWydawaniaProduktuOd>` +
      `<iloscProduktuDoWydaniaObecnie><jednostka>szt</jednostka><wartosc>1</wartosc></iloscProduktuDoWydaniaObecnie>` +
      `<iloscWydanegoProduktu><jednostka>szt</jednostka><wartosc>0</wartosc></iloscWydanegoProduktu>` +
      `<iloscProduktuDoWydaniaSuma><jednostka>szt</jednostka><wartosc>2</wartosc></iloscProduktuDoWydaniaSuma>` +
      `</stanRealizacjiRecepty>${okWynik}</OdczytStanuRealizacjiReceptyResponse>`,
  );

  it("parsuje ilości i datę wydawania", async () => {
    const { client, req } = capturing(response);
    const result = await readPrescriptionFulfillmentState("RX-1", transportWith(client));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dispenseFrom).toBe("2026-05-01");
      expect(result.value.quantityToDispenseTotal?.value).toBe("2");
      expect(result.value.quantityDispensed?.unit).toBe("szt");
    }
    expect(req()?.headers.SOAPAction).toBe("urn:odczytStanuRealizacjiRecepty");
  });
});

describe("readFulfillmentDocument / readCancellationDocument", () => {
  it("odczytuje dokument realizacji (CDA z base64)", async () => {
    const cda = "<Realizacja/>";
    const response = env(
      `<OdczytDokumentuRealizacjiReceptyResponse><realizacjaRecepty>` +
        `<dokumentRealizacjiRecepty>${Buffer.from(cda, "utf8").toString("base64")}</dokumentRealizacjiRecepty>` +
        `<status>OBOWIAZUJACY</status></realizacjaRecepty>${okWynik}</OdczytDokumentuRealizacjiReceptyResponse>`,
    );
    const { client, req } = capturing(response);
    const result = await readFulfillmentDocument(
      { root: "R", extension: "D-1" },
      transportWith(client),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cdaXml).toBe(cda);
      expect(result.value.status).toBe("OBOWIAZUJACY");
    }
    expect(req()?.headers.SOAPAction).toBe("urn:odczytDokumentuRealizacjiRecepty");
    expect(req()?.body).toContain(
      "<r:identyfikatorDokumentuRealizacjiRecepty><wsp:extension>D-1</wsp:extension><wsp:root>R</wsp:root>",
    );
  });

  it("odczytuje dokument anulowania (CDA z base64)", async () => {
    const cda = "<Anulowanie/>";
    const response = env(
      `<OdczytDokumentuAnulowaniaReceptyResponse><dokumentAnulowaniaRecepty>` +
        `<tresc>${Buffer.from(cda, "utf8").toString("base64")}</tresc></dokumentAnulowaniaRecepty>` +
        `${okWynik}</OdczytDokumentuAnulowaniaReceptyResponse>`,
    );
    const { client, req } = capturing(response);
    const result = await readCancellationDocument(
      { root: "R", extension: "A-1" },
      transportWith(client),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.cdaXml).toBe(cda);
    expect(req()?.headers.SOAPAction).toBe("urn:odczytDokumentuAnulowaniaRecepty");
  });
});

describe("searchFulfillmentDocuments / searchCancellationDocuments", () => {
  it("wyszukuje dokumenty realizacji", async () => {
    const response = env(
      `<WyszukanieDokumentowRealizacjiReceptResponse><wynikiWyszukiwaniaDokumentowRealizacji>` +
        `<wynikWyszukiwaniaDokumentowRealizacji>` +
        `<identyfikatorDokumentuRealizacjiRecepty><extension>D-1</extension><root>R</root></identyfikatorDokumentuRealizacjiRecepty>` +
        `<statusDokumentuRealizacjiRecepty>OBOWIAZUJACY</statusDokumentuRealizacjiRecepty>` +
        `<rodzajRealizacji>ZAMYKAJACA</rodzajRealizacji><dataWystawienia>2026-05-01T10:00:00.000Z</dataWystawienia>` +
        `<identyfikatorPracownikaRealizatora><extension>9999999</extension><root>N</root></identyfikatorPracownikaRealizatora>` +
        `</wynikWyszukiwaniaDokumentowRealizacji></wynikiWyszukiwaniaDokumentowRealizacji>` +
        `${okWynik}</WyszukanieDokumentowRealizacjiReceptResponse>`,
    );
    const { client, req } = capturing(response);
    const result = await searchFulfillmentDocuments(
      { kind: "ZAMYKAJACA", realizerNpwz: "9999999" },
      transportWith(client),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.documents[0]?.documentId?.extension).toBe("D-1");
      expect(result.value.documents[0]?.kind).toBe("ZAMYKAJACA");
      expect(result.value.documents[0]?.realizerNpwz).toBe("9999999");
    }
    expect(req()?.headers.SOAPAction).toBe("urn:wyszukanieDokumentowRealizacjiRecept");
    expect(req()?.body).toContain("<r:rodzajRealizacji>ZAMYKAJACA</r:rodzajRealizacji>");
  });

  it("wyszukuje dokumenty anulowania", async () => {
    const response = env(
      `<WyszukanieDokumentowAnulowaniaReceptResponse><wynikiWyszukiwaniaDokumentowAnulowania>` +
        `<wynikWyszukiwaniaDokumentowAnulowania>` +
        `<identyfikatorDokumentuAnulowaniaRecepty><extension>A-1</extension><root>R</root></identyfikatorDokumentuAnulowaniaRecepty>` +
        `<dataWystawienia>2026-05-01T10:00:00.000Z</dataWystawienia>` +
        `<kluczRecepty><kluczRecepty>RX-1</kluczRecepty></kluczRecepty>` +
        `</wynikWyszukiwaniaDokumentowAnulowania></wynikiWyszukiwaniaDokumentowAnulowania>` +
        `${okWynik}</WyszukanieDokumentowAnulowaniaReceptResponse>`,
    );
    const { client, req } = capturing(response);
    const result = await searchCancellationDocuments(
      { prescriptionNumber: { root: "R", extension: "NR-1" } },
      transportWith(client),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.documents[0]?.documentId?.extension).toBe("A-1");
      expect(result.value.documents[0]?.prescriptionKey).toBe("RX-1");
    }
    expect(req()?.headers.SOAPAction).toBe("urn:wyszukanieDokumentowAnulowaniaRecept");
    expect(req()?.body).toContain("<r:numerRecepty><wsp:extension>NR-1</wsp:extension>");
  });
});
