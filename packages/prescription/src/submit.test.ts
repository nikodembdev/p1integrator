import { generateKeyPairSync } from "node:crypto";
import type { CallContext, DocumentSigner, HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import {
  PRESCRIPTION_CONTEXT_NAMESPACE,
  type PrescriptionTransport,
  submitPrescriptionPackage,
} from "./submit.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

const context: CallContext = {
  subject: { root: "1.2.3", extension: "P" },
  user: { root: "1.2.4", extension: "U" },
  workplace: { root: "1.2.5", extension: "M" },
  businessRole: "DOCTOR",
};

const documentSigner: DocumentSigner = {
  signXades: (xml) => Promise.resolve(`<signed>${xml}</signed>`),
};

const transportWith = (httpClient: HttpClient): PrescriptionTransport => ({
  context,
  documentSigner,
  httpClient,
  wsSecurityCertificate: { privateKeyPem, certificateBase64: "ZHVtbXk=" },
  endpoint: "https://p1.example/ObslugaReceptyWS",
  clock: { now: () => new Date("2026-01-01T00:00:00Z") },
});

const SOAP_NS = 'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"';
const successResponse =
  `<soap:Envelope ${SOAP_NS}><soap:Body><ZapisPakietuReceptResponse>` +
  `<potwierdzenieOperacjiZapisu><wynikZapisuPakietuRecept>` +
  `<kluczPakietuRecept>PKG-KEY</kluczPakietuRecept>` +
  `<kodPakietuRecept>1234</kodPakietuRecept>` +
  `<wynikWeryfikacji><weryfikowanaRecepta>` +
  `<numerReceptyWPakiecie>1</numerReceptyWPakiecie><kluczRecepty>RX-KEY-1</kluczRecepty>` +
  `</weryfikowanaRecepta></wynikWeryfikacji>` +
  `</wynikZapisuPakietuRecept></potwierdzenieOperacjiZapisu>` +
  `<wynik><major>urn:csioz:p1:wynik:ok</major><komunikat>OK</komunikat></wynik>` +
  `</ZapisPakietuReceptResponse></soap:Body></soap:Envelope>`;

describe("submitPrescriptionPackage", () => {
  it("podpisuje recepty, buduje kopertę zapisPakietuRecept i parsuje klucze", async () => {
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (request) => {
        captured = request;
        return Promise.resolve({ status: 200, headers: {}, body: successResponse });
      },
    };

    const result = await submitPrescriptionPackage(
      [{ id: 1, cdaXml: "<ClinicalDocument/>" }],
      transportWith(client),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.packageKey).toBe("PKG-KEY");
      expect(result.value.packageCode).toBe("1234");
      expect(result.value.prescriptions).toEqual([{ id: "1", key: "RX-KEY-1" }]);
      expect(result.value.outcome?.major).toBe("urn:csioz:p1:wynik:ok");
    }

    // SOAPAction + endpoint
    expect(captured?.headers.SOAPAction).toBe("urn:zapisPakietuRecept");
    expect(captured?.url).toBe("https://p1.example/ObslugaReceptyWS");
    // struktura body recepty
    expect(captured?.body).toContain("ZapisPakietuReceptRequest");
    expect(captured?.body).toContain("<pakietRecept>");
    expect(captured?.body).toContain("<r:recepty>");
    expect(captured?.body).toContain(
      "<r:identyfikatorDokumentuWPakiecie>1</r:identyfikatorDokumentuWPakiecie>",
    );
    expect(captured?.body).toContain("<r:tresc>");
    // dialekt kontekstu e-recepty
    expect(captured?.body).toContain(PRESCRIPTION_CONTEXT_NAMESPACE);
    expect(captured?.body).toContain("urn:csioz:p1:erecepta:kontekst:idPodmiotuOidRoot");
    // koperta podpisana WS-Security
    expect(captured?.body).toContain("<ds:Signature");
    // podpisany CDA jako base64 w tresc
    const base64 = Buffer.from("<signed><ClinicalDocument/></signed>", "utf8").toString("base64");
    expect(captured?.body).toContain(base64);
  });

  it("umieszcza wiele recept w jednym pakiecie z kolejnymi identyfikatorami", async () => {
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (request) => {
        captured = request;
        return Promise.resolve({ status: 200, headers: {}, body: successResponse });
      },
    };

    await submitPrescriptionPackage(
      [
        { id: 1, cdaXml: "<a/>" },
        { id: 2, cdaXml: "<b/>" },
      ],
      transportWith(client),
    );

    expect(captured?.body).toContain(
      "<r:identyfikatorDokumentuWPakiecie>1</r:identyfikatorDokumentuWPakiecie>",
    );
    expect(captured?.body).toContain(
      "<r:identyfikatorDokumentuWPakiecie>2</r:identyfikatorDokumentuWPakiecie>",
    );
  });

  it("mapuje SOAP Fault na błąd", async () => {
    const client: HttpClient = {
      send: () =>
        Promise.resolve({
          status: 500,
          headers: {},
          body: `<soap:Envelope ${SOAP_NS}><soap:Body><soap:Fault><faultstring>boom</faultstring></soap:Fault></soap:Body></soap:Envelope>`,
        }),
    };
    const result = await submitPrescriptionPackage(
      [{ id: 1, cdaXml: "<a/>" }],
      transportWith(client),
    );
    expect(result.ok).toBe(false);
  });

  it("mapuje błąd sieci na błąd transportu", async () => {
    const client: HttpClient = { send: () => Promise.reject(new Error("ECONNREFUSED")) };
    const result = await submitPrescriptionPackage(
      [{ id: 1, cdaXml: "<a/>" }],
      transportWith(client),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("transport");
  });
});
