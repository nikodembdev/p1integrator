import { CONTEXT_NAMESPACE } from "@p1/core";
import { SignedXml } from "xml-crypto";
import {
  BASE64_ENCODING_TYPE,
  CANONICALIZATION_ALGORITHM,
  DIGEST_ALGORITHM,
  SIGNATURE_ALGORITHM,
  WSSE_NS,
  WSU_NS,
  X509_TOKEN_TYPE,
} from "./constants.js";

export interface WsSecurityCertificate {
  readonly privateKeyPem: string;
  /** DER certyfikatu Base64 (np. z `parseP12().certificateBase64`). */
  readonly certificateBase64: string;
}

export interface WsSecurityOptions {
  readonly certificate: WsSecurityCertificate;
  /** Znacznik czasu - wstrzykiwalny dla deterministycznych testów. */
  readonly now?: Date;
  /** Czas ważności znacznika Timestamp (w sekundach). */
  readonly ttlSeconds?: number;
  /** Sufiks identyfikatorów `wsu:Id` - wstrzykiwalny dla testów. */
  readonly idSuffix?: string;
  /**
   * Namespace elementu `kontekstWywolania` do zlokalizowania go w XPath podpisu.
   * Domyślnie e-skierowanie (v20180509); musi być spójny z kopertą (e-recepta: v20170510).
   */
  readonly contextNamespace?: string;
  /**
   * Czy podpisać `kontekstWywolania` (domyślnie true). EDM/AUT przekazuje dane nie
   * w kontekście, lecz w treści żądania - wtedy ustaw false (podpisywany jest Body + Timestamp).
   */
  readonly includeContextReference?: boolean;
}

const SECURITY_PLACEHOLDER = /<wsse:Security[\s\S]*?<\/wsse:Security>/;

/**
 * Podpisuje kopertę SOAP zgodnie z WS-Security: wstrzykuje Timestamp +
 * BinarySecurityToken do `<wsse:Security>` i dodaje podpis (RSA-SHA256, exc-c14n)
 * obejmujący Body, kontekstWywolania i Timestamp.
 */
export function signWsSecurity(envelopeXml: string, options: WsSecurityOptions): string {
  if (!SECURITY_PLACEHOLDER.test(envelopeXml)) {
    throw new Error("Envelope has no <wsse:Security> placeholder to sign");
  }

  const now = options.now ?? new Date();
  const ttlSeconds = options.ttlSeconds ?? 300;
  const suffix = options.idSuffix ?? String(now.getTime());
  const tokenId = `X509-${suffix}`;
  const timestampId = `TS-${suffix}`;
  const created = now.toISOString();
  const expires = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

  const securityHeader =
    `<wsse:Security soapenv:mustUnderstand="1" xmlns:wsse="${WSSE_NS}" xmlns:wsu="${WSU_NS}">` +
    `<wsu:Timestamp wsu:Id="${timestampId}">` +
    `<wsu:Created>${created}</wsu:Created><wsu:Expires>${expires}</wsu:Expires>` +
    `</wsu:Timestamp>` +
    `<wsse:BinarySecurityToken EncodingType="${BASE64_ENCODING_TYPE}"` +
    ` ValueType="${X509_TOKEN_TYPE}" wsu:Id="${tokenId}">` +
    `${options.certificate.certificateBase64}</wsse:BinarySecurityToken>` +
    `</wsse:Security>`;

  const prepared = envelopeXml.replace(SECURITY_PLACEHOLDER, securityHeader);

  const signer = new SignedXml({
    privateKey: options.certificate.privateKeyPem,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    canonicalizationAlgorithm: CANONICALIZATION_ALGORITHM,
  });

  const contextNamespace = options.contextNamespace ?? CONTEXT_NAMESPACE;
  const signedElements = [
    "//*[local-name(.)='Body']",
    ...(options.includeContextReference === false
      ? []
      : [`//*[local-name(.)='kontekstWywolania' and namespace-uri(.)='${contextNamespace}']`]),
    `//*[local-name(.)='Timestamp' and namespace-uri(.)='${WSU_NS}']`,
  ];
  for (const xpath of signedElements) {
    signer.addReference({
      xpath,
      transforms: [CANONICALIZATION_ALGORITHM],
      digestAlgorithm: DIGEST_ALGORITHM,
    });
  }

  signer.getKeyInfoContent = () =>
    `<wsse:SecurityTokenReference xmlns:wsse="${WSSE_NS}">` +
    `<wsse:Reference URI="#${tokenId}" ValueType="${X509_TOKEN_TYPE}"/>` +
    `</wsse:SecurityTokenReference>`;

  signer.computeSignature(prepared, {
    prefix: "ds",
    location: {
      reference: `//*[local-name(.)='Security' and namespace-uri(.)='${WSSE_NS}']`,
      action: "append",
    },
  });

  return signer.getSignedXml();
}
