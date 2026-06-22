import { generateKeyPairSync } from "node:crypto";
import type { CallContext, DocumentSigner, HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import { type IpomTransport, IPOM_WS_NS, submitIpomDocument } from "./submit.js";

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

const transportWith = (httpClient: HttpClient): IpomTransport => ({
  context,
  documentSigner,
  httpClient,
  wsSecurityCertificate: { privateKeyPem, certificateBase64: "ZHVtbXk=" },
  endpoint: "https://p1.example/ObslugaPlanowOpiekiMedycznejWS",
  clock: { now: () => new Date("2026-01-01T00:00:00Z") },
});

const SOAP12 = 'xmlns:soap="http://www.w3.org/2003/05/soap-envelope"';
const successResponse =
  `<soap:Envelope ${SOAP12}><soap:Body><ZapisPlanuOpiekiMedycznejResponse>` +
  `<wynikiWeryfikacjiDokumentu>` +
  `<wynikWeryfikacji>urn:csioz:p1:kodWynikuWeryfikacji:pozytywny</wynikWeryfikacji>` +
  `<identyfikatorZbioruRegul>POM</identyfikatorZbioruRegul>` +
  `</wynikiWeryfikacjiDokumentu>` +
  `<wynik><major>urn:csioz:p1:kod:major:Sukces</major><komunikat>OK</komunikat></wynik>` +
  `</ZapisPlanuOpiekiMedycznejResponse></soap:Body></soap:Envelope>`;

describe("submitIpomDocument", () => {
  it("podpisuje CDA, buduje kopertę SOAP 1.2 zapisPlanuOpiekiMedycznej i parsuje wynik", async () => {
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (request) => {
        captured = request;
        return Promise.resolve({ status: 200, headers: {}, body: successResponse });
      },
    };

    const result = await submitIpomDocument("<ClinicalDocument/>", transportWith(client));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.verification).toBe("urn:csioz:p1:kodWynikuWeryfikacji:pozytywny");
    expect(result.value.outcome?.major).toBe("urn:csioz:p1:kod:major:Sukces");

    // Koperta: SOAP 1.2, action w Content-Type, podpisany CDA w base64 trescDokumentu.
    expect(captured?.headers?.["Content-Type"]).toContain("application/soap+xml");
    expect(captured?.headers?.["Content-Type"]).toContain('action="urn:zapisPlanuOpiekiMedycznej"');
    expect(captured?.body).toContain('xmlns:soapenv="http://www.w3.org/2003/05/soap-envelope"');
    expect(captured?.body).toContain(`xmlns:ws="${IPOM_WS_NS}"`);
    expect(captured?.body).toContain("<trescDokumentu>");
    const base64 = Buffer.from("<signed><ClinicalDocument/></signed>", "utf8").toString("base64");
    expect(captured?.body).toContain(base64);
  });

  it("zwraca wyniki weryfikacji poszczególnych reguł (REG.WER.*)", async () => {
    const ruleResponse =
      `<soap:Envelope ${SOAP12}><soap:Body><ZapisPlanuOpiekiMedycznejResponse>` +
      `<wynikiWeryfikacjiDokumentu>` +
      `<wynikWeryfikacji>urn:csioz:p1:kodWynikuWeryfikacji:blad</wynikWeryfikacji>` +
      `<identyfikatorZbioruRegul>POM</identyfikatorZbioruRegul>` +
      `<wynikWeryfikacjiReguly>` +
      `<kodRegulyWeryfikacji>REG.WER.99999</kodRegulyWeryfikacji>` +
      `<wynikWeryfikacji>urn:csioz:p1:kodWynikuWeryfikacji:blad</wynikWeryfikacji>` +
      `<opisProblemu>Niepoprawne dane</opisProblemu>` +
      `<miejsceWystapieniaBledu>/ClinicalDocument</miejsceWystapieniaBledu>` +
      `</wynikWeryfikacjiReguly>` +
      `</wynikiWeryfikacjiDokumentu>` +
      `<wynik><major>urn:csioz:p1:kod:major:Sukces</major></wynik>` +
      `</ZapisPlanuOpiekiMedycznejResponse></soap:Body></soap:Envelope>`;
    const client: HttpClient = {
      send: () => Promise.resolve({ status: 200, headers: {}, body: ruleResponse }),
    };

    const result = await submitIpomDocument("<ClinicalDocument/>", transportWith(client));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rules).toHaveLength(1);
    expect(result.value.rules[0]).toMatchObject({
      code: "REG.WER.99999",
      description: "Niepoprawne dane",
      location: "/ClinicalDocument",
    });
  });
});
