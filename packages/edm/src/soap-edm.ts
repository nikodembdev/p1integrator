import { signWsSecurity, type WsSecurityCertificate } from "@p1/transport";

/**
 * Wspólna koperta SOAP 1.2 dla operacji EDM (ITI-18/42/57/...): WS-Addressing,
 * asercja SAML w nagłówku WS-Security + podpis X.509 (Body+Timestamp). Asercja jako
 * token nośny wstrzykiwana po podpisaniu (P1 podpisuje ją po swojej stronie).
 */

const SOAP12_NS = "http://www.w3.org/2003/05/soap-envelope";
const WSA_NS = "http://www.w3.org/2005/08/addressing";
const WSU_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
const WSSE_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";

export interface EdmEnvelopeOptions {
  /** WS-Addressing Action (np. `urn:ihe:iti:2007:RegistryStoredQuery`). */
  readonly action: string;
  /** Adres usługi (wsa:To). */
  readonly endpoint: string;
  /** Wewnętrzny XML elementu Body (żądanie operacji). */
  readonly bodyXml: string;
  /** Asercja SAML (z `requestSamlToken`). */
  readonly assertionXml: string;
  /** Certyfikat WSS (podpis X.509). */
  readonly certificate: WsSecurityCertificate;
  /** Dodatkowe deklaracje namespace na <Envelope> (prefiks → URI). */
  readonly namespaces?: Readonly<Record<string, string>>;
  readonly now?: Date;
  readonly ttlSeconds?: number;
  readonly idSuffix?: string;
  readonly messageId?: string;
}

const escapeXml = (v: string): string =>
  v.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);

/** Buduje podpisaną kopertę SOAP 1.2 EDM z osadzoną asercją SAML. */
export function buildSignedEdmEnvelope(options: EdmEnvelopeOptions): string {
  const messageId = options.messageId ?? `urn:uuid:${options.idSuffix ?? "message"}`;
  const extraNs = Object.entries(options.namespaces ?? {})
    .map(([prefix, uri]) => ` xmlns:${prefix}="${uri}"`)
    .join("");

  const envelope =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${SOAP12_NS}" xmlns:wsu="${WSU_NS}"${extraNs}>` +
    `<soapenv:Header>` +
    `<wsa:Action xmlns:wsa="${WSA_NS}">${options.action}</wsa:Action>` +
    `<wsa:To xmlns:wsa="${WSA_NS}">${escapeXml(options.endpoint)}</wsa:To>` +
    `<wsa:MessageID xmlns:wsa="${WSA_NS}">${escapeXml(messageId)}</wsa:MessageID>` +
    `<wsse:Security xmlns:wsse="${WSSE_NS}"></wsse:Security>` +
    `</soapenv:Header>` +
    `<soapenv:Body wsu:Id="Body">${options.bodyXml}</soapenv:Body>` +
    `</soapenv:Envelope>`;

  const signed = signWsSecurity(envelope, {
    certificate: options.certificate,
    includeContextReference: false,
    ...(options.now !== undefined ? { now: options.now } : {}),
    ...(options.ttlSeconds !== undefined ? { ttlSeconds: options.ttlSeconds } : {}),
    ...(options.idSuffix !== undefined ? { idSuffix: options.idSuffix } : {}),
  });

  // Asercja (token nośny) zaraz po otwarciu <wsse:Security ...>.
  return signed.replace(/(<wsse:Security\b[^>]*>)/, `$1${options.assertionXml}`);
}

/** Nagłówek Content-Type dla SOAP 1.2 z parametrem action. */
export function soap12ContentType(action: string): string {
  return `application/soap+xml; charset=utf-8; action="${action}"`;
}

/** Status odpowiedzi ebRS oznaczający sukces. */
export const EBRS_STATUS_SUCCESS = "urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Success";
