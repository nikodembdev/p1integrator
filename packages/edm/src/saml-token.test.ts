import { generateKeyPairSync } from "node:crypto";
import type { CallContext, HttpClient } from "@p1/core";
import { describe, expect, it } from "vitest";
import {
  buildSamlTokenRequest,
  extractAssertion,
  requestSamlToken,
  type SamlTokenRequest,
} from "./saml-token.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

const context: CallContext = {
  subject: { root: "2.16.840.1.113883.3.4424.2.3.1", extension: "000000927722" },
  user: { root: "2.16.840.1.113883.3.4424.1.6.2", extension: "4727124" },
  workplace: { root: "2.16.840.1.113883.3.4424.2.3.3", extension: "001" },
  businessRole: "DOCTOR",
};

const baseInput: SamlTokenRequest = {
  context,
  wsSecurityCertificate: { privateKeyPem, certificateBase64: "ZHVtbXk=" },
  now: new Date("2026-01-01T00:00:00Z"),
  idSuffix: "test",
  messageId: "urn:uuid:test-1",
};

describe("buildSamlTokenRequest", () => {
  it("buduje podpisaną kopertę RST/Issue z atrybutami SAML (XSPA)", () => {
    const xml = buildSamlTokenRequest(baseInput);
    expect(xml).toContain("<wst:RequestSecurityToken");
    expect(xml).toContain(
      "<wst:RequestType>http://docs.oasis-open.org/ws-sx/ws-trust/200512/Issue</wst:RequestType>",
    );
    expect(xml).toContain(
      "<wst:TokenType>http://docs.oasis-open.org/wss/oasis-wss-saml-tokenprofile-1.1#SAMLV2.0</wst:TokenType>",
    );
    expect(xml).toContain("<saml:AttributeStatement>");
    expect(xml).toContain("<saml:AuthnStatement");
    expect(xml).toContain("<saml:AuthnContextClassRef>");
    expect(xml).not.toContain("WymianaEDM"); // AppliesTo domyślnie pominięte
    // podmiot jako organization-id w formacie root#extension
    expect(xml).toContain(
      '<saml:Attribute Name="urn:oasis:names:tc:xspa:1.0:subject:organization-id">' +
        '<saml:AttributeValue xsi:type="xs:string">2.16.840.1.113883.3.4424.2.3.1#000000927722</saml:AttributeValue>',
    );
    // użytkownik (subject-id) + rola (functional-role) + tryb (purpose=TREAT)
    expect(xml).toContain('Name="urn:oasis:names:tc:SAML:attribute:subject-id"');
    expect(xml).toContain(
      '<saml:AttributeValue xsi:type="xs:string">medical doctor</saml:AttributeValue>',
    );
    expect(xml).toContain('<saml:AttributeValue xsi:type="xs:string">TREAT</saml:AttributeValue>');
    expect(xml).toContain('<wsa:Action xmlns:wsa="http://www.w3.org/2005/08/addressing">');
    // podpis WS-Security
    expect(xml).toContain("<ds:Signature");
    expect(xml).toContain("<wsse:BinarySecurityToken");
  });

  it("dodaje pacjenta (resource-id) i tryb BTG (purpose), gdy podane", () => {
    const xml = buildSamlTokenRequest({
      ...baseInput,
      patient: { root: "2.16.840.1.113883.3.4424.1.1.616", extension: "40010151673" },
      accessMode: "BTG",
    });
    expect(xml).toContain(
      '<saml:Attribute Name="urn:oasis:names:tc:xacml:1.0:resource:resource-id">' +
        '<saml:AttributeValue xsi:type="xs:string">2.16.840.1.113883.3.4424.1.1.616#40010151673</saml:AttributeValue>',
    );
    expect(xml).toContain('<saml:AttributeValue xsi:type="xs:string">BTG</saml:AttributeValue>');
  });

  it("pomija pacjenta i source-organization, gdy nie podane", () => {
    const xml = buildSamlTokenRequest(baseInput);
    expect(xml).not.toContain("resource:resource-id");
    expect(xml).not.toContain("urn:p1:source-organization");
  });
});

const rstrc =
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>` +
  `<wst:RequestSecurityTokenResponseCollection xmlns:wst="http://docs.oasis-open.org/ws-sx/ws-trust/200512/">` +
  `<wst:RequestSecurityTokenResponse><wst:RequestedSecurityToken>` +
  `<saml2:Assertion xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion" ID="_abc123" Version="2.0">` +
  `<saml2:Conditions NotOnOrAfter="2026-01-01T01:00:00Z"/>` +
  `<saml2:AttributeStatement/></saml2:Assertion>` +
  `</wst:RequestedSecurityToken></wst:RequestSecurityTokenResponse>` +
  `</wst:RequestSecurityTokenResponseCollection></soap:Body></soap:Envelope>`;

describe("extractAssertion", () => {
  it("wyciąga surową asercję + ID + NotOnOrAfter", () => {
    const token = extractAssertion(rstrc);
    expect(token).toBeDefined();
    expect(token?.assertionXml).toContain("<saml2:Assertion");
    expect(token?.assertionXml).toContain("</saml2:Assertion>");
    expect(token?.assertionId).toBe("_abc123");
    expect(token?.notOnOrAfter).toBe("2026-01-01T01:00:00Z");
  });

  it("zwraca undefined, gdy brak asercji", () => {
    expect(extractAssertion("<soap:Envelope/>")).toBeUndefined();
  });
});

describe("requestSamlToken", () => {
  it("zwraca asercję przy poprawnej odpowiedzi", async () => {
    let captured: string | undefined;
    const client: HttpClient = {
      send: (req) => {
        captured = req.headers.SOAPAction;
        return Promise.resolve({ status: 200, headers: {}, body: rstrc });
      },
    };
    const result = await requestSamlToken(baseInput, client);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.assertionId).toBe("_abc123");
    expect(captured).toBe("http://docs.oasis-open.org/ws-sx/ws-trust/200512/RST/Issue");
  });

  it("mapuje SOAP Fault na błąd biznesowy", async () => {
    const client: HttpClient = {
      send: () =>
        Promise.resolve({
          status: 500,
          headers: {},
          body: `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultstring>brak uprawnien</faultstring></soap:Fault></soap:Body></soap:Envelope>`,
        }),
    };
    const result = await requestSamlToken(baseInput, client);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("brak uprawnien");
  });

  it("mapuje błąd sieci na błąd transportu", async () => {
    const client: HttpClient = { send: () => Promise.reject(new Error("ECONNREFUSED")) };
    const result = await requestSamlToken(baseInput, client);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("transport");
  });
});
