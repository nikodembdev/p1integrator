import { createHash, createPublicKey, createVerify } from "node:crypto";
import forge from "node-forge";
import * as xpath from "xpath";
import { DOMParser } from "@xmldom/xmldom";
import { ExclusiveCanonicalization } from "xml-crypto";
import { describe, expect, it } from "vitest";
import { createXadesDocumentSigner } from "./xades-document-signer.js";

const DSIG = "http://www.w3.org/2000/09/xmldsig#";
const XADES = "http://uri.etsi.org/01903/v1.3.2#";

/** Generuje testowy PKCS#12 (RSA + self-signed) — bez sięgania po realne certy. */
function makeTestP12(password: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(2020, 0, 1);
  cert.validity.notAfter = new Date(2030, 0, 1);
  const attrs = [{ name: "commonName", value: "Test Lekarz" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password);
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary");
}

const CDA =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<?xml-stylesheet href="CDA_PL_IG_1.3.2.xsl" type="text/xsl"?>\n' +
  '<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:extPL="http://www.csioz.gov.pl/xsd/extPL/r3"' +
  ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="extPL:ClinicalDocument">' +
  '<id root="2.16.840.1.113883.3.4424.2.7.999" extension="1"/><title>Test</title></ClinicalDocument>';

describe("createXadesDocumentSigner (podpisywarka in-process)", () => {
  const signer = createXadesDocumentSigner({
    certificate: { p12: makeTestP12("haslo"), password: "haslo" },
  });

  it("produces a structurally complete enveloped XAdES-BES signature", async () => {
    const signed = await signer.signXades(CDA);
    expect(signed).toContain("<?xml-stylesheet"); // warstwa prezentacyjna zachowana
    expect(signed).toContain("ds:Signature");
    expect(signed).toContain("xades:QualifyingProperties");
    expect(signed).toContain("xades:SigningCertificate");
    expect(signed).toMatch(/<ds:SignatureValue>[^<]+<\/ds:SignatureValue>/);
    // referencja SignedProperties ma transformę exc-c14n
    expect(signed).toMatch(
      /Type="http:\/\/uri\.etsi\.org\/01903#SignedProperties"[\s\S]*?xml-exc-c14n#/,
    );
  });

  it("computes a standard exc-c14n digest and a verifiable signature", async () => {
    const signed = await signer.signXades(CDA);
    const doc = new DOMParser().parseFromString(signed, "application/xml");
    const select = xpath.useNamespaces({ ds: DSIG, xades: XADES });
    const c14n = new ExclusiveCanonicalization();
    const sha = (s: string): string =>
      createHash("sha256").update(Buffer.from(s, "utf8")).digest("base64");

    // 1) digest referencji dokumentu = prolog (PI) + exc-c14n korzenia bez podpisu
    const clone = doc.cloneNode(true) as never;
    const sigInClone = (select("//ds:Signature", clone) as never[])[0] as never;
    (sigInClone as { parentNode: { removeChild: (n: never) => void } }).parentNode.removeChild(
      sigInClone,
    );
    const root = (clone as { documentElement: never }).documentElement;
    const expectedDocDigest = sha(
      '<?xml-stylesheet href="CDA_PL_IG_1.3.2.xsl" type="text/xsl"?>\n' + c14n.process(root, {}),
    );
    const docDigest = (
      select("//ds:Reference[@URI='']/ds:DigestValue/text()", doc as never) as never[]
    )[0];
    expect(String(docDigest)).toBe(expectedDocDigest);

    // 2) SignatureValue weryfikuje się względem exc-c14n(SignedInfo) i certyfikatu z KeyInfo
    const si = (select("//ds:SignedInfo", doc as never) as never[])[0];
    const sv = String((select("//ds:SignatureValue/text()", doc as never) as never[])[0]).replace(
      /\s/g,
      "",
    );
    const certB64 = String(
      (select("//ds:X509Certificate/text()", doc as never) as never[])[0],
    ).replace(/\s/g, "");
    const pem = `-----BEGIN CERTIFICATE-----\n${certB64.replace(/(.{64})/g, "$1\n")}\n-----END CERTIFICATE-----\n`;
    const ok = createVerify("RSA-SHA256")
      .update(Buffer.from(c14n.process(si as never, {}), "utf8"))
      .verify(createPublicKey(pem), Buffer.from(sv, "base64"));
    expect(ok).toBe(true);
  });
});
