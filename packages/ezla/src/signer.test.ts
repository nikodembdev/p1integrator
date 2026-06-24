import forge from "node-forge";
import { describe, expect, it } from "vitest";
import { createEzlaSigner } from "./signer.js";

/** Generuje testowy PKCS#12 (klucz RSA + self-signed cert) - bez zależności od realnego certu. */
function makeTestP12(): { p12: Buffer; password: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "0a1b2c";
  cert.validity.notBefore = new Date("2020-01-01");
  cert.validity.notAfter = new Date("2030-01-01");
  const attrs = [
    { shortName: "CN", value: "Test Lekarz" },
    { shortName: "O", value: "CSIOZ" },
    { shortName: "C", value: "PL" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], "pass", { algorithm: "3des" });
  const der = forge.asn1.toDer(asn1).getBytes();
  return { p12: Buffer.from(der, "binary"), password: "pass" };
}

describe("createEzlaSigner", () => {
  const signer = createEzlaSigner({
    certificate: makeTestP12(),
    now: new Date("2026-06-24T12:00:00Z"),
    idSuffix: "TEST",
  });

  it("podpisuje dokument XAdES-BES z parametrami ZUS (inclusive c14n + rsa-sha1)", async () => {
    const signed = await signer.signDocument(
      '<KEDU xmlns="http://www.zus.pl/2015/KED_ZLA_1"><ZUSZLA/></KEDU>',
    );

    expect(signed).toContain('<ds:Signature Id="ID-sig-TEST"');
    expect(signed).toContain('Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"');
    expect(signed).toContain('Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"');
    expect(signed).toContain("not(ancestor-or-self::ds:Signature)");
    expect(signed).toContain('Type="http://uri.etsi.org/01903#SignedProperties"');
  });

  it("dołącza XAdES SignedProperties (SigningTime + SigningCertificate) i KeyInfo", async () => {
    const signed = await signer.signLoginStatement(
      "<Oswiadczenie><Token>CK-1</Token></Oswiadczenie>",
    );

    expect(signed).toContain("<xades:SigningTime>2026-06-24T12:00:00.000Z</xades:SigningTime>");
    expect(signed).toContain("<xades:SigningCertificate>");
    expect(signed).toContain("<ds:X509IssuerName>CN=Test Lekarz,O=CSIOZ,C=PL</ds:X509IssuerName>");
    expect(signed).toMatch(/<ds:X509SerialNumber>\d+<\/ds:X509SerialNumber>/); // serial dziesiętnie
    expect(signed).toContain("<ds:X509Certificate>");
  });

  it("wypełnia DigestValue obu referencji i SignatureValue (niepuste)", async () => {
    const signed = await signer.signLoginStatement(
      "<Oswiadczenie><Token>CK-2</Token></Oswiadczenie>",
    );

    const digests = [...signed.matchAll(/<ds:DigestValue>([^<]+)<\/ds:DigestValue>/g)].map(
      (m) => m[1],
    );
    // 2 referencje (dokument + SignedProperties) + CertDigest = 3 niepuste digesty
    expect(digests.filter((d) => d && d.length > 0).length).toBeGreaterThanOrEqual(3);
    expect(/<ds:SignatureValue>[A-Za-z0-9+/=]{300,}<\/ds:SignatureValue>/.test(signed)).toBe(true);
  });
});
