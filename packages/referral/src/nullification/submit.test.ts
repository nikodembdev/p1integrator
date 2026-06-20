import { generateKeyPairSync } from "node:crypto";
import type { CallContext, DocumentSigner, HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import type { ReferralTransport } from "../submit.js";
import { submitNullificationDocument } from "./submit.js";

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
const okResponse =
  `<soap:Envelope ${SOAP_NS}><soap:Body><ZapisDokumentuAnulowaniaSkierowaniaResponse>` +
  `<wynik><major>urn:csioz:p1:wynik:ok</major><komunikat>OK</komunikat></wynik>` +
  `</ZapisDokumentuAnulowaniaSkierowaniaResponse></soap:Body></soap:Envelope>`;

describe("submitNullificationDocument", () => {
  it("uses the nullification SOAP action and includes the annulled referral number", async () => {
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (request) => {
        captured = request;
        return Promise.resolve({ status: 200, headers: {}, body: okResponse });
      },
    };

    const result = await submitNullificationDocument(
      "<ClinicalDocument/>",
      { root: "2.16.840.1.113883.3.4424.2.7.999.4.1", extension: "9999999999999999999999" },
      transportWith(client),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.outcome?.major).toBe("urn:csioz:p1:wynik:ok");

    expect(captured?.headers.SOAPAction).toBe("urn:zapisDokumentuAnulowaniaSkierowania");
    expect(captured?.body).toContain("ZapisDokumentuAnulowaniaSkierowaniaRequest");
    expect(captured?.body).toContain("<mt:tresc>");
    expect(captured?.body).toContain("<wsp:extension>9999999999999999999999</wsp:extension>");
    expect(captured?.body).toContain("<ds:Signature"); // koperta podpisana WS-Security
  });
});
