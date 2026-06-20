import { generateKeyPairSync } from "node:crypto";
import type { CallContext, DocumentSigner, HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import { type ReferralTransport, submitReferralDocument } from "./submit.js";

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

const transportWith = (httpClient: HttpClient): ReferralTransport => ({
  context,
  documentSigner,
  httpClient,
  wsSecurityCertificate: { privateKeyPem, certificateBase64: "ZHVtbXk=" },
  endpoint: "https://p1.example/eskierowanie",
  clock: { now: () => new Date("2026-01-01T00:00:00Z") },
});

const SOAP_NS = 'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"';
const successResponse =
  `<soap:Envelope ${SOAP_NS}><soap:Body><ZapisDokumentuSkierowaniaResponse>` +
  `<potwierdzenieOperacjiZapisu><kluczSkierowania>KEY-123</kluczSkierowania>` +
  `<kodSkierowania>1234</kodSkierowania></potwierdzenieOperacjiZapisu>` +
  `<wynik><major>urn:csioz:p1:wynik:ok</major><komunikat>OK</komunikat></wynik>` +
  `</ZapisDokumentuSkierowaniaResponse></soap:Body></soap:Envelope>`;

describe("submitReferralDocument", () => {
  it("signs the CDA, builds a signed SOAP request and parses the response", async () => {
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (request) => {
        captured = request;
        return Promise.resolve({ status: 200, headers: {}, body: successResponse });
      },
    };

    const result = await submitReferralDocument("<ClinicalDocument/>", transportWith(client));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.referralKey).toBe("KEY-123");
      expect(result.value.referralCode).toBe("1234");
      expect(result.value.outcome?.major).toBe("urn:csioz:p1:wynik:ok");
    }

    expect(captured?.headers.SOAPAction).toBe("urn:zapisDokumentuSkierowania");
    expect(captured?.url).toBe("https://p1.example/eskierowanie");
    expect(captured?.body).toContain("ZapisDokumentuSkierowaniaRequest");
    expect(captured?.body).toContain("<mt:tresc>");
    expect(captured?.body).toContain("<ds:Signature"); // koperta podpisana WS-Security
    const base64 = Buffer.from("<signed><ClinicalDocument/></signed>", "utf8").toString("base64");
    expect(captured?.body).toContain(base64); // podpisany CDA, base64 w tresc
  });

  it("maps a SOAP fault to an error result", async () => {
    const client: HttpClient = {
      send: () =>
        Promise.resolve({
          status: 500,
          headers: {},
          body: `<soap:Envelope ${SOAP_NS}><soap:Body><soap:Fault><faultstring>boom</faultstring></soap:Fault></soap:Body></soap:Envelope>`,
        }),
    };
    const result = await submitReferralDocument("<ClinicalDocument/>", transportWith(client));
    expect(result.ok).toBe(false);
  });

  it("maps a network failure to a transport error", async () => {
    const client: HttpClient = { send: () => Promise.reject(new Error("ECONNREFUSED")) };
    const result = await submitReferralDocument("<ClinicalDocument/>", transportWith(client));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("transport");
  });
});
