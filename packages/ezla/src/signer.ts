/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { createHash, createSign } from "node:crypto";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import forge from "node-forge";
import { C14nCanonicalization, ExclusiveCanonicalization } from "xml-crypto";
import * as xpath from "xpath";
import { XMLDSIG_NS } from "./constants.js";
import type { EzlaSigner } from "./types.js";

const XADES_NS = "http://uri.etsi.org/01903/v1.3.2#";
const INCLUSIVE_C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const EXCLUSIVE_C14N = "http://www.w3.org/2001/10/xml-exc-c14n#";
const XPATH_TRANSFORM = "http://www.w3.org/TR/1999/REC-xpath-19991116";
const RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
const SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";

/** Certyfikat podpisujący (PKCS#12 + hasło) - klucz lekarza. */
export interface EzlaSigningCertificate {
  readonly p12: Buffer;
  readonly password: string;
}

export interface EzlaSignerOptions {
  readonly certificate: EzlaSigningCertificate;
  /** Czas podpisu (SigningTime) - wstrzykiwalny dla testów. */
  readonly now?: Date;
  /** Sufiks identyfikatorów - wstrzykiwalny dla testów (domyślnie znacznik czasu). */
  readonly idSuffix?: string;
}

interface ParsedSigningKey {
  readonly privateKeyPem: string;
  readonly certificateBase64: string;
  readonly certDigestSha1Base64: string;
  readonly issuerName: string;
  readonly serialDecimal: string;
}

const inclusiveC14n = new C14nCanonicalization();
const exclusiveC14n = new ExclusiveCanonicalization();
const sha1Base64 = (input: string): string =>
  createHash("sha1").update(Buffer.from(input, "utf8")).digest("base64");

/**
 * Adapter podpisu XAdES-BES wymaganego przez ZUS e-ZLA (kanał gabinetowy).
 * Parametry wg podpisanych przykładów ZUS: inclusive c14n (`REC-xml-c14n-20010315`),
 * `rsa-sha1` + `sha1`, Reference URI="" z transformą XPath `not(ancestor-or-self::ds:Signature)`,
 * Reference SignedProperties z exc-c14n, KeyInfo X509Certificate. Podpis enveloped -
 * dokładany jako ostatni element korzenia podpisywanego dokumentu (`<Oswiadczenie>`/`<KEDU>`).
 */
export function createEzlaSigner(options: EzlaSignerOptions): EzlaSigner {
  const key = parseSigningP12(options.certificate.p12, options.certificate.password);

  const sign = (xml: string): string =>
    signXadesZus(xml, key, options.now ?? new Date(), options.idSuffix);

  return {
    signLoginStatement: (statement) => Promise.resolve(sign(statement)),
    signDocument: (keduXml) => Promise.resolve(sign(keduXml)),
  };
}

/** Podpisuje dokument XAdES-BES (enveloped) parametrami ZUS; zwraca podpisany XML. */
export function signXadesZus(
  xml: string,
  key: ParsedSigningKey,
  now: Date,
  idSuffix?: string,
): string {
  const suffix = idSuffix ?? String(now.getTime());
  const sigId = `ID-sig-${suffix}`;
  const docRefId = `ID-ref-${suffix}`;
  const spId = `ID-sp-${suffix}`;
  const signingTime = now.toISOString();

  const doc = new DOMParser().parseFromString(stripXmlDeclaration(xml), "text/xml");
  const root = (doc as any).documentElement;

  // Reference URI="" - digest dokumentu BEZ podpisu (jeszcze go nie ma) = inclusive c14n korzenia.
  const docDigest = sha1Base64(inclusiveC14n.process(root, {}));

  // Składamy strukturę podpisu (z pustymi DigestValue/SignatureValue), dołączamy do korzenia.
  const signatureXml = buildSignatureXml({ sigId, docRefId, spId, signingTime, docDigest, key });
  const signature = new DOMParser().parseFromString(signatureXml, "text/xml");
  root.appendChild((doc as any).importNode((signature as any).documentElement, true));

  const select = xpath.useNamespaces({ ds: XMLDSIG_NS, xades: XADES_NS });

  // Digest SignedProperties - exc-c14n elementu (w kontekście, z namespace'ami xades/ds).
  const sp = (select("//xades:SignedProperties", doc as any) as any[])[0];
  const spDigest = sha1Base64(exclusiveC14n.process(sp, {}));
  (select(`//ds:Reference[@Type]/ds:DigestValue`, doc as any) as any[])[0].textContent = spDigest;

  // SignatureValue - inclusive c14n SignedInfo (z poprawnymi digestami) → RSA-SHA1.
  const signedInfo = (select("//ds:SignedInfo", doc as any) as any[])[0];
  const signatureValue = createSign("RSA-SHA1")
    .update(Buffer.from(inclusiveC14n.process(signedInfo, {}), "utf8"))
    .sign(key.privateKeyPem, "base64");
  (select("//ds:SignatureValue", doc as any) as any[])[0].textContent = signatureValue;

  return new XMLSerializer().serializeToString(doc);
}

function buildSignatureXml(p: {
  sigId: string;
  docRefId: string;
  spId: string;
  signingTime: string;
  docDigest: string;
  key: ParsedSigningKey;
}): string {
  return (
    `<ds:Signature Id="${p.sigId}" xmlns:ds="${XMLDSIG_NS}">` +
    `<ds:SignedInfo>` +
    `<ds:CanonicalizationMethod Algorithm="${INCLUSIVE_C14N}"/>` +
    `<ds:SignatureMethod Algorithm="${RSA_SHA1}"/>` +
    `<ds:Reference Id="${p.docRefId}" URI="">` +
    `<ds:Transforms><ds:Transform Algorithm="${XPATH_TRANSFORM}">` +
    `<ds:XPath xmlns:xades="${XADES_NS}">not(ancestor-or-self::ds:Signature)</ds:XPath>` +
    `</ds:Transform></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="${SHA1}"/>` +
    `<ds:DigestValue>${p.docDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${p.spId}">` +
    `<ds:Transforms><ds:Transform Algorithm="${EXCLUSIVE_C14N}"/></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="${SHA1}"/>` +
    `<ds:DigestValue></ds:DigestValue>` +
    `</ds:Reference>` +
    `</ds:SignedInfo>` +
    `<ds:SignatureValue></ds:SignatureValue>` +
    `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${p.key.certificateBase64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` +
    `<ds:Object>` +
    `<xades:QualifyingProperties xmlns:xades="${XADES_NS}" Target="#${p.sigId}">` +
    `<xades:SignedProperties Id="${p.spId}">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${p.signingTime}</xades:SigningTime>` +
    `<xades:SigningCertificate><xades:Cert>` +
    `<xades:CertDigest>` +
    `<ds:DigestMethod Algorithm="${SHA1}"/>` +
    `<ds:DigestValue>${p.key.certDigestSha1Base64}</ds:DigestValue>` +
    `</xades:CertDigest>` +
    `<xades:IssuerSerial>` +
    `<ds:X509IssuerName>${escapeText(p.key.issuerName)}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber>${p.key.serialDecimal}</ds:X509SerialNumber>` +
    `</xades:IssuerSerial>` +
    `</xades:Cert></xades:SigningCertificate>` +
    `</xades:SignedSignatureProperties>` +
    `</xades:SignedProperties>` +
    `</xades:QualifyingProperties>` +
    `</ds:Object>` +
    `</ds:Signature>`
  );
}

/** Parsuje PKCS#12: klucz prywatny (PEM), cert (DER base64 + digest SHA-1), issuer DN, serial dziesiętnie. */
export function parseSigningP12(p12: Buffer, password: string): ParsedSigningKey {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12.toString("binary")));
  const container = forge.pkcs12.pkcs12FromAsn1(asn1, password);
  const keyBag =
    container.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag!
    ]?.[0] ?? container.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag!]?.[0];
  const certBag = container.getBags({ bagType: forge.pki.oids.certBag })[
    forge.pki.oids.certBag!
  ]?.[0];
  if (!keyBag?.key || !certBag?.cert) {
    throw new Error("Nie znaleziono klucza prywatnego lub certyfikatu w .p12");
  }
  const cert = certBag.cert;
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certificateBase64: forge.util.encode64(certDer),
    certDigestSha1Base64: forge.util.encode64(
      forge.md.sha1.create().update(certDer).digest().getBytes(),
    ),
    issuerName: formatIssuerName(cert.issuer.attributes),
    serialDecimal: BigInt(`0x${cert.serialNumber}`).toString(10),
  };
}

/**
 * Buduje X509IssuerName w postaci RFC 2253 (np. `CN=...,OU=...,O=CSIOZ,C=PL`).
 * node-forge zwraca atrybuty już w kolejności od najbardziej szczegółowego (CN) -
 * zgodnej z tym, co pokazuje ZUS - więc bez odwracania.
 */
function formatIssuerName(attributes: forge.pki.CertificateField[]): string {
  return attributes
    .map((a) => `${a.shortName ?? a.name ?? ""}=${a.value as string}`)
    .filter((s) => !s.startsWith("="))
    .join(",");
}

function stripXmlDeclaration(xml: string): string {
  return xml.replace(/^\s*<\?xml[^?]*\?>\s*/i, "");
}

function escapeText(value: string): string {
  return value.replace(/[<>&]/g, (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"));
}
