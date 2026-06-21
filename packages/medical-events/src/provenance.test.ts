import { generateKeyPairSync } from "node:crypto";
import forge from "node-forge";
import { describe, expect, it } from "vitest";
import {
  buildMedicalEventProvenance,
  buildProvenanceSignature,
  ZM_PROVENANCE,
} from "./provenance.js";

/** Generuje parę kluczy + samopodpisany certyfikat (PEM) na potrzeby testu. */
function makeKeyAndCert(): { privateKeyPem: string; certificatePem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const forgeKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const forgePub = forge.pki.publicKeyFromPem(
    publicKey.export({ type: "spki", format: "pem" }).toString(),
  );
  const cert = forge.pki.createCertificate();
  cert.publicKey = forgePub;
  cert.serialNumber = "0a";
  cert.validity.notBefore = new Date(2020, 0, 1);
  cert.validity.notAfter = new Date(2030, 0, 1);
  const attrs = [
    { shortName: "CN", value: "Test Podmiot" },
    { shortName: "O", value: "CSIOZ" },
    { shortName: "C", value: "PL" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(forgeKey, forge.md.sha256.create());
  return { privateKeyPem, certificatePem: forge.pki.certificateToPem(cert) };
}

function decodeSignature(base64: string): string {
  return Buffer.from(base64, "base64").toString("utf8");
}

describe("buildProvenanceSignature", () => {
  const { privateKeyPem, certificatePem } = makeKeyAndCert();
  const resources = [
    { url: "https://isus.ezdrowie.gov.pl/fhir/Patient/540/_history/2", xml: "<Patient/>" },
    { url: "https://isus.ezdrowie.gov.pl/fhir/Encounter/1/_history/1", xml: "<Encounter/>" },
  ];

  it("zwraca base64 detached XAdES-BES z referencją na każdy zasób", () => {
    const data = buildProvenanceSignature({
      resources,
      certificatePem,
      privateKeyPem,
      signingTime: new Date("2026-06-21T10:00:00.000Z"),
      signatureId: "xmldsig-test",
    });
    const xml = decodeSignature(data);
    expect(xml).toContain("<ds:Signature");
    expect(xml).toContain('URI="https://isus.ezdrowie.gov.pl/fhir/Patient/540/_history/2"');
    expect(xml).toContain('URI="https://isus.ezdrowie.gov.pl/fhir/Encounter/1/_history/1"');
    expect(xml).toContain('Type="http://uri.etsi.org/01903#SignedProperties"');
    expect(xml).toContain("<xades:SigningTime>2026-06-21T10:00:00.000Z</xades:SigningTime>");
    expect(xml).toContain("<ds:SignatureValue");
    expect(xml).toContain("<ds:X509Certificate>");
  });

  it("podpis nie deklaruje ponownie ds: w wewnętrznym SignedInfo", () => {
    const data = buildProvenanceSignature({ resources, certificatePem, privateKeyPem });
    const xml = decodeSignature(data);
    // ds: deklarowane raz na <ds:Signature>, nie ponownie na SignedInfo
    expect(xml).toContain("<ds:Signature xmlns:ds=");
    expect(xml).toContain("<ds:SignedInfo><ds:CanonicalizationMethod");
  });
});

describe("buildMedicalEventProvenance", () => {
  it("agent i podpisujący to Podmiot (OID .2.3.1), bez role/display/onBehalfOf", () => {
    const prov = buildMedicalEventProvenance({
      targets: [
        { reference: "Patient/540", type: "Patient" },
        { reference: "Encounter/1", type: "Encounter" },
      ],
      organization: { identifier: "000000927722" },
      when: "2026-06-21T10:00:00.000Z",
      signatureData: "AAAA",
    });
    const json = JSON.stringify(prov);
    expect(json).toContain('"resourceType":"Provenance"');
    expect(json).toContain(ZM_PROVENANCE.PROFILE);
    expect(json).toContain(`"system":"${ZM_PROVENANCE.PROVIDER}","value":"000000927722"`);
    expect(json).toContain(`"code":"${ZM_PROVENANCE.SIGNATURE_TYPE_CODE}"`);
    expect(json).not.toContain('"role"');
    expect(json).not.toContain('"onBehalfOf"');
    expect(json).not.toContain('"display"');
    expect(json).toContain('"targetFormat":"application/fhir+xml"');
  });
});
