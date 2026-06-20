import type { CallContext } from "@p1/core";
import { SignedXml } from "xml-crypto";
import { describe, expect, it } from "vitest";
import { parseP12 } from "./certificate.js";
import { buildSoapEnvelope } from "./soap-envelope.js";
import { makeTestCertificate } from "./test-helpers.js";
import { signWsSecurity } from "./ws-security.js";

const testCert = makeTestCertificate("secret");
const certificate = parseP12(testCert.p12, "secret");

const context: CallContext = {
  subject: { root: "1.2.3", extension: "P" },
  user: { root: "1.2.4", extension: "U" },
  workplace: { root: "1.2.5", extension: "M" },
  businessRole: "DOCTOR",
};

const envelope = buildSoapEnvelope({ context, body: "<req/>" });
const signed = signWsSecurity(envelope, {
  certificate,
  now: new Date("2026-01-01T00:00:00Z"),
  idSuffix: "test",
});

describe("signWsSecurity", () => {
  it("injects Timestamp and BinarySecurityToken with deterministic ids", () => {
    expect(signed).toContain('<wsu:Timestamp wsu:Id="TS-test">');
    expect(signed).toContain("<wsu:Created>2026-01-01T00:00:00.000Z</wsu:Created>");
    expect(signed).toContain('wsu:Id="X509-test"');
    expect(signed).toContain("BinarySecurityToken");
  });

  it("signs Body, Kontekst and Timestamp (three references)", () => {
    const references = signed.match(/<ds:Reference\b/g) ?? [];
    expect(references).toHaveLength(3);
    expect(signed).toContain("<ds:Signature");
    expect(signed).toContain("SecurityTokenReference");
  });

  it("produces a cryptographically valid signature", () => {
    const signatureXml = signed.match(/<ds:Signature[\s\S]*?<\/ds:Signature>/)?.[0];
    if (!signatureXml) throw new Error("signature element not found");
    const verifier = new SignedXml({ publicCert: certificate.certificatePem });
    verifier.loadSignature(signatureXml);
    expect(verifier.checkSignature(signed)).toBe(true);
  });

  it("throws when the envelope has no Security placeholder", () => {
    expect(() => signWsSecurity("<a/>", { certificate })).toThrow();
  });
});
