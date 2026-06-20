import forge from "node-forge";

export interface TestCertificate {
  readonly p12: Buffer;
  readonly password: string;
  readonly certificatePem: string;
}

/**
 * Generuje jednorazowy, samopodpisany certyfikat testowy w pamięci (klucz 1024-bit
 * dla szybkości). Nic nie trafia do repo — gitleaks zadowolony.
 */
export function makeTestCertificate(password = "test"): TestCertificate {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date("2020-01-01T00:00:00Z");
  certificate.validity.notAfter = new Date("2030-01-01T00:00:00Z");
  const attrs = [{ name: "commonName", value: "p1-test" }];
  certificate.setSubject(attrs);
  certificate.setIssuer(attrs);
  certificate.sign(keys.privateKey, forge.md.sha256.create());

  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], password, {
    algorithm: "3des",
  });
  const p12 = Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary");

  return { p12, password, certificatePem: forge.pki.certificateToPem(certificate) };
}
