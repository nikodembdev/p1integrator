import { describe, expect, it } from "vitest";
import { parseP12 } from "./certificate.js";
import { makeTestCertificate } from "./test-helpers.js";

const cert = makeTestCertificate("secret");

describe("parseP12", () => {
  it("extracts private key PEM, certificate PEM and Base64 DER", () => {
    const parsed = parseP12(cert.p12, "secret");
    expect(parsed.privateKeyPem).toContain("PRIVATE KEY");
    expect(parsed.certificatePem).toContain("BEGIN CERTIFICATE");
    expect(parsed.certificateBase64).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(parsed.certificateBase64.length).toBeGreaterThan(100);
  });

  it("throws on a wrong password", () => {
    expect(() => parseP12(cert.p12, "wrong")).toThrow();
  });
});
