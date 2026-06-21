import { createHash, createSign } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import forge from "node-forge";
import { C14nCanonicalization } from "xml-crypto";

/**
 * Autentyczność Zdarzenia Medycznego: zasób FHIR Provenance (profil
 * PLMedicalEventProvenance) z podpisem XAdES-BES w `Provenance.signature.data`.
 * Podpis (detached) referuje utworzone zasoby po ich wersjonowanych URL-ach,
 * kanonikalizacja inclusive (xml-c14n-20010315), RSA-SHA256, certyfikat Podmiotu.
 */

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";
const XADES_NS = "http://uri.etsi.org/01903/v1.3.2#";
const SIGNED_PROPS_TYPE = "http://uri.etsi.org/01903#SignedProperties";

/** Podpisywany zasób: jego wersjonowany URL oraz surowe oktety XML (do digestu). */
export interface SignedResourceRef {
  /** Pełny, wersjonowany URL zasobu, np. https://.../fhir/Encounter/{id}/_history/1. */
  readonly url: string;
  /** Surowe oktety zasobu (application/fhir+xml). */
  readonly xml: string;
}

export interface ProvenanceSignatureInput {
  readonly resources: readonly SignedResourceRef[];
  /** Certyfikat uwierzytelniający (PEM) - do KeyInfo i SigningCertificate. */
  readonly certificatePem: string;
  /** Klucz prywatny (PEM) do podpisu RSA-SHA256. */
  readonly privateKeyPem: string;
  /** Czas podpisu (domyślnie teraz). */
  readonly signingTime?: Date;
  /** Identyfikator podpisu (domyślnie generowany). */
  readonly signatureId?: string;
}

function sha256Base64(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("base64");
}

type C14nNode = Parameters<C14nCanonicalization["process"]>[0];

function canonicalize(xmlFragment: string): string {
  const doc = new DOMParser().parseFromString(xmlFragment, "text/xml");
  if (!doc.documentElement) {
    throw new Error("Nie udało się sparsować fragmentu XML do kanonikalizacji");
  }
  const canon = new C14nCanonicalization();
  // Rzutowanie wymagane, gdy w zasięgu jest DOM lib (np. typecheck examples) - typ Node
  // xml-crypto rozjeżdża się wtedy z Element z @xmldom/xmldom.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return canon.process(doc.documentElement as unknown as C14nNode, {});
}

/** Dane certyfikatu potrzebne w KeyInfo / SigningCertificate. */
interface CertInfo {
  base64Der: string;
  digestBase64: string;
  issuerName: string;
  serialNumber: string;
  subjectName: string;
}

function readCert(certificatePem: string): CertInfo {
  const cert = forge.pki.certificateFromPem(certificatePem);
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const base64Der = forge.util.encode64(der);
  const digestBase64 = sha256Base64(Buffer.from(der, "binary"));
  return {
    base64Der,
    digestBase64,
    issuerName: formatDn(cert.issuer.attributes),
    serialNumber: BigInt(`0x${cert.serialNumber}`).toString(10),
    subjectName: formatDn(cert.subject.attributes),
  };
}

/** Formatuje DN jak DSS: małe skróty, kolejność jak w certyfikacie, rozdzielone przecinkiem. */
function formatDn(attributes: forge.pki.CertificateField[]): string {
  return attributes
    .map((a) => `${(a.shortName ?? a.name ?? "").toLowerCase()}=${String(a.value)}`)
    .join(",");
}

const escapeXml = (v: string): string =>
  v.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);

/**
 * Buduje podpis XAdES-BES (base64) nad podanymi zasobami - wartość do
 * `Provenance.signature.data`.
 */
export function buildProvenanceSignature(input: ProvenanceSignatureInput): string {
  const cert = readCert(input.certificatePem);
  const id = input.signatureId ?? `xmldsig-${randomId()}`;
  const signedPropsId = `${id}-signedprops`;
  const signingTime = (input.signingTime ?? new Date()).toISOString();

  // SignedProperties (z deklaracjami ns, by standalone c14n = c14n w kontekście).
  const signedProperties =
    `<xades:SignedProperties xmlns:xades="${XADES_NS}" xmlns:ds="${DSIG_NS}" Id="${signedPropsId}">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
    `<xades:SigningCertificate><xades:Cert>` +
    `<xades:CertDigest><ds:DigestMethod Algorithm="${SHA256}"/>` +
    `<ds:DigestValue>${cert.digestBase64}</ds:DigestValue></xades:CertDigest>` +
    `<xades:IssuerSerial><ds:X509IssuerName>${escapeXml(cert.issuerName)}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber>${cert.serialNumber}</ds:X509SerialNumber></xades:IssuerSerial>` +
    `</xades:Cert></xades:SigningCertificate>` +
    `</xades:SignedSignatureProperties></xades:SignedProperties>`;
  const signedPropsDigest = sha256Base64(canonicalize(signedProperties));

  // SignedInfo: referencje do zasobów (digest surowych oktetów) + ref do SignedProperties.
  const resourceRefs = input.resources
    .map(
      (r, i) =>
        `<ds:Reference Id="${id}-ref${i}" URI="${escapeXml(r.url)}">` +
        `<ds:DigestMethod Algorithm="${SHA256}"/>` +
        `<ds:DigestValue>${sha256Base64(r.xml)}</ds:DigestValue></ds:Reference>`,
    )
    .join("");
  const signedInfo =
    `<ds:SignedInfo xmlns:ds="${DSIG_NS}">` +
    `<ds:CanonicalizationMethod Algorithm="${C14N}"/>` +
    `<ds:SignatureMethod Algorithm="${RSA_SHA256}"/>` +
    resourceRefs +
    `<ds:Reference Type="${SIGNED_PROPS_TYPE}" URI="#${signedPropsId}">` +
    `<ds:Transforms><ds:Transform Algorithm="${C14N}"/></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="${SHA256}"/>` +
    `<ds:DigestValue>${signedPropsDigest}</ds:DigestValue></ds:Reference>` +
    `</ds:SignedInfo>`;

  const signatureValue = createSign("RSA-SHA256")
    .update(canonicalize(signedInfo))
    .end()
    .sign(input.privateKeyPem)
    .toString("base64");

  const signature =
    `<ds:Signature xmlns:ds="${DSIG_NS}" Id="${id}">` +
    signedInfo.replace(` xmlns:ds="${DSIG_NS}"`, "") +
    `<ds:SignatureValue Id="${id}-sigvalue">${signatureValue}</ds:SignatureValue>` +
    `<ds:KeyInfo><ds:X509Data>` +
    `<ds:X509Certificate>${cert.base64Der}</ds:X509Certificate>` +
    `<ds:X509IssuerSerial><ds:X509IssuerName>${escapeXml(cert.issuerName)}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber>${cert.serialNumber}</ds:X509SerialNumber></ds:X509IssuerSerial>` +
    `<ds:X509SubjectName>${escapeXml(cert.subjectName)}</ds:X509SubjectName>` +
    `</ds:X509Data></ds:KeyInfo>` +
    `<ds:Object><xades:QualifyingProperties xmlns:xades="${XADES_NS}" Target="#${id}">` +
    signedProperties.replace(` xmlns:xades="${XADES_NS}" xmlns:ds="${DSIG_NS}"`, "") +
    `</xades:QualifyingProperties></ds:Object></ds:Signature>`;

  return Buffer.from(signature, "utf8").toString("base64");
}

function randomId(): string {
  // 8 segmentów hex (jak w przykładach DSS)
  return Array.from({ length: 4 }, () =>
    Math.floor((1 + Number(process.hrtime.bigint() % 65536n)) % 65536)
      .toString(16)
      .padStart(4, "0"),
  ).join("");
}

// --- Provenance (PLMedicalEventProvenance) ---

export const ZM_PROVENANCE = {
  PROFILE: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLMedicalEventProvenance",
  CONFIDENTIALITY: "urn:oid:2.16.840.1.113883.3.4424.11.1.83",
  PROVIDER: "urn:oid:2.16.840.1.113883.3.4424.2.3.1",
  SIGNATURE_TYPE_SYSTEM: "urn:oid:2.16.840.1.113883.3.4424.11.1.86",
  SIGNATURE_TYPE_CODE: "1.2.840.10065.1.12.1.14",
  TARGET_FORMAT: "application/fhir+xml",
  SIG_FORMAT: "application/signature+xml",
} as const;

export interface MedicalEventProvenanceInput {
  /** Referencje podpisanych zasobów (Patient/Encounter/Condition...) jako "Type/{id}". */
  targets: { reference: string; type: string }[];
  /** Podmiot leczniczy (agent i podpisujący), identyfikator z OID .2.3.1. */
  organization: { identifier: string };
  /** Czas zarejestrowania/podpisu (ISO). */
  when: string;
  /** Podpis XAdES-BES (base64) z {@link buildProvenanceSignature}. */
  signatureData: string;
}

type Json = Record<string, unknown>;

/**
 * Buduje zasób FHIR Provenance (PLMedicalEventProvenance) z podpisem.
 * Agent i podpisujący to Podmiot leczniczy (identyfikator OID .2.3.1);
 * profil nie dopuszcza role/display/onBehalfOf.
 */
export function buildMedicalEventProvenance(input: MedicalEventProvenanceInput): Json {
  const who = {
    identifier: { system: ZM_PROVENANCE.PROVIDER, value: input.organization.identifier },
  };
  return {
    resourceType: "Provenance",
    meta: {
      profile: [ZM_PROVENANCE.PROFILE],
      security: [{ system: ZM_PROVENANCE.CONFIDENTIALITY, code: "N" }],
    },
    target: input.targets.map((t) => ({ reference: t.reference, type: t.type })),
    recorded: input.when,
    agent: [{ who }],
    signature: [
      {
        type: [
          { system: ZM_PROVENANCE.SIGNATURE_TYPE_SYSTEM, code: ZM_PROVENANCE.SIGNATURE_TYPE_CODE },
        ],
        when: input.when,
        who,
        targetFormat: ZM_PROVENANCE.TARGET_FORMAT,
        sigFormat: ZM_PROVENANCE.SIG_FORMAT,
        data: input.signatureData,
      },
    ],
  };
}
