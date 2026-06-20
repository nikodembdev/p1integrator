import forge from "node-forge";

export interface ParsedCertificate {
  readonly privateKeyPem: string;
  readonly certificatePem: string;
  /** DER certyfikatu zakodowany Base64 — do `<wsse:BinarySecurityToken>`. */
  readonly certificateBase64: string;
}

/** Wczytuje klucz prywatny i certyfikat z kontenera PKCS#12 (.p12/.pfx). */
export function parseP12(p12: Buffer, password: string): ParsedCertificate {
  const der = forge.util.createBuffer(p12.toString("binary"));
  const asn1 = forge.asn1.fromDer(der);
  const container = forge.pkcs12.pkcs12FromAsn1(asn1, password);

  const keyBag =
    firstBag(container, forge.pki.oids.pkcs8ShroudedKeyBag!) ??
    firstBag(container, forge.pki.oids.keyBag!);
  const certBag = firstBag(container, forge.pki.oids.certBag!);

  if (!keyBag?.key) throw new Error("PKCS#12 container has no private key");
  if (!certBag?.cert) throw new Error("PKCS#12 container has no certificate");

  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certificatePem: forge.pki.certificateToPem(certBag.cert),
    certificateBase64: certificateToBase64(certBag.cert),
  };
}

/** Zwraca DER certyfikatu zakodowany Base64 (zawartość BinarySecurityToken). */
export function certificateToBase64(certificate: forge.pki.Certificate): string {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
  return forge.util.encode64(der);
}

function firstBag(
  container: forge.pkcs12.Pkcs12Pfx,
  bagType: string,
): forge.pkcs12.Bag | undefined {
  const bags = container.getBags({ bagType })[bagType];
  return bags && bags.length > 0 ? bags[0] : undefined;
}
