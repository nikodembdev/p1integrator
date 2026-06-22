import { generateKeyPairSync } from "node:crypto";
import type { HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import { buildVerifyAccessRequest, verifyAccess, type VerifyAccessInput } from "./soz.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

const baseInput: VerifyAccessInput = {
  assertionXml: '<saml2:Assertion xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion" ID="_a"/>',
  wsSecurityCertificate: { privateKeyPem, certificateBase64: "ZHVtbXk=" },
  documentIds: ["2.16.840.1.113883.3.4424.2.7.1491^DOC1"],
  now: new Date("2026-01-01T00:00:00Z"),
  idSuffix: "test",
};

describe("buildVerifyAccessRequest", () => {
  it("buduje XACMLAuthzDecisionQuery (SOAP 1.1) z atrybutem zasobu i podpisem", () => {
    const xml = buildVerifyAccessRequest(baseInput);
    expect(xml).toContain('xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"'); // SOAP 1.1
    expect(xml).toContain("<samlp:XACMLAuthzDecisionQueryRequest");
    expect(xml).toContain('Category="urn:oasis:names:tc:xacml:3.0:attribute-category:resource"');
    expect(xml).toContain('AttributeId="urn:csioz:p1:autoryzacja:idDokumentu"');
    expect(xml).toContain(
      '<xacml:AttributeValue DataType="http://www.w3.org/2001/XMLSchema#string">' +
        "2.16.840.1.113883.3.4424.2.7.1491^DOC1</xacml:AttributeValue>",
    );
    // asercja + podpis, brak WS-Addressing
    expect(xml).toContain("<saml2:Assertion");
    expect(xml).toContain("<ds:Signature");
    expect(xml).not.toContain("wsa:Action");
  });

  it("dodaje typ dokumentu i zakres dat, gdy podane", () => {
    const xml = buildVerifyAccessRequest({
      ...baseInput,
      documentType: "06.10",
      issuedFrom: "2026-01-01",
      issuedTo: "2026-06-01",
    });
    expect(xml).toContain('AttributeId="urn:csioz:p1:autoryzacja:typDokumentu"');
    expect(xml).toContain('AttributeId="urn:csioz:p1:autoryzacja:dataWystawieniaOd"');
    expect(xml).toContain('AttributeId="urn:csioz:p1:autoryzacja:dataWystawieniaDo"');
  });
});

const permitResponse =
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>` +
  `<XACMLAuthzDecisionStatementResponse><saml2:Assertion><xacml-context:Response>` +
  `<xacml-context:Result><xacml-context:Decision>Permit</xacml-context:Decision></xacml-context:Result>` +
  `</xacml-context:Response></saml2:Assertion></XACMLAuthzDecisionStatementResponse>` +
  `</soap:Body></soap:Envelope>`;

describe("verifyAccess", () => {
  it("parsuje decyzję Permit i ustawia SOAPAction", async () => {
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (req) => {
        captured = req;
        return Promise.resolve({ status: 200, headers: {}, body: permitResponse });
      },
    };
    const result = await verifyAccess(baseInput, client);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.decision).toBe("Permit");
      expect(result.value.decisions).toEqual(["Permit"]);
    }
    expect(captured?.headers.SOAPAction).toBe("urn:weryfikujDostepDoDanych");
  });

  it("mapuje błąd sieci na błąd transportu", async () => {
    const client: HttpClient = { send: () => Promise.reject(new Error("ECONNREFUSED")) };
    const result = await verifyAccess(baseInput, client);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("transport");
  });
});
