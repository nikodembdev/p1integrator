import {
  err,
  type HttpClient,
  ok,
  type P1Error,
  P1BusinessError,
  P1TransportError,
  type Result,
} from "@p1/core";
import { signWsSecurity, type WsSecurityCertificate } from "@p1/transport";
import { buildRegistryObjectList, type DocumentIndexInput } from "./ebrim.js";

/**
 * ITI-42 (Register Document Set-b) - zapis indeksu EDM w rejestrze P1.
 * Koperta SOAP 1.2 z `lcm:SubmitObjectsRequest`, asercja SAML w nagłówku WS-Security
 * + podpis X.509 (Body+Timestamp), WS-Addressing, nad mTLS. Odpowiedź: ebRS RegistryResponse.
 */

const SOAP12_NS = "http://www.w3.org/2003/05/soap-envelope";
const WSA_NS = "http://www.w3.org/2005/08/addressing";
const WSU_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
const WSSE_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const LCM_NS = "urn:oasis:names:tc:ebxml-regrep:xsd:lcm:3.0";
const ACTION = "urn:ihe:iti:2007:RegisterDocumentSet-b";
const STATUS_SUCCESS = "urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Success";

/** Domyślny endpoint ITI-42 (środowisko integracyjne). */
export const DEFAULT_ITI42_ENDPOINT = "https://isus.ezdrowie.gov.pl/services/ObslugaEdmIti42WS";

export interface RegisterDocumentSetInput {
  readonly endpoint?: string;
  /** Metadane indeksu (DocumentEntry + SubmissionSet + Association). */
  readonly index: DocumentIndexInput;
  /** Asercja SAML (z `requestSamlToken`) wstawiana do nagłówka WS-Security. */
  readonly assertionXml: string;
  /** Certyfikat WSS (podpis X.509 koperty). */
  readonly wsSecurityCertificate: WsSecurityCertificate;
  readonly now?: Date;
  readonly ttlSeconds?: number;
  readonly idSuffix?: string;
  readonly messageId?: string;
}

export interface RegistryError {
  readonly errorCode?: string;
  readonly codeContext?: string;
  readonly severity?: string;
  readonly location?: string;
}

export interface RegisterDocumentSetResult {
  /** Czy rejestr zwrócił Success. */
  readonly success: boolean;
  /** Surowy status (ResponseStatusType). */
  readonly status?: string;
  /** Lista błędów z RegistryErrorList (gdy Failure/warning). */
  readonly errors: readonly RegistryError[];
  readonly raw: string;
}

const escapeXml = (v: string): string =>
  v.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);

/** Buduje podpisaną kopertę ITI-42 z osadzoną asercją SAML. */
export function buildRegisterDocumentSetRequest(input: RegisterDocumentSetInput): string {
  const endpoint = input.endpoint ?? DEFAULT_ITI42_ENDPOINT;
  const messageId = input.messageId ?? `urn:uuid:${input.idSuffix ?? "message"}`;

  const envelope =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${SOAP12_NS}" xmlns:wsu="${WSU_NS}" xmlns:lcm="${LCM_NS}">` +
    `<soapenv:Header>` +
    `<wsa:Action xmlns:wsa="${WSA_NS}">${ACTION}</wsa:Action>` +
    `<wsa:To xmlns:wsa="${WSA_NS}">${escapeXml(endpoint)}</wsa:To>` +
    `<wsa:MessageID xmlns:wsa="${WSA_NS}">${escapeXml(messageId)}</wsa:MessageID>` +
    `<wsse:Security xmlns:wsse="${WSSE_NS}"></wsse:Security>` +
    `</soapenv:Header>` +
    `<soapenv:Body wsu:Id="Body">` +
    `<lcm:SubmitObjectsRequest>${buildRegistryObjectList(input.index)}</lcm:SubmitObjectsRequest>` +
    `</soapenv:Body></soapenv:Envelope>`;

  const signed = signWsSecurity(envelope, {
    certificate: input.wsSecurityCertificate,
    includeContextReference: false,
    ...(input.now !== undefined ? { now: input.now } : {}),
    ...(input.ttlSeconds !== undefined ? { ttlSeconds: input.ttlSeconds } : {}),
    ...(input.idSuffix !== undefined ? { idSuffix: input.idSuffix } : {}),
  });

  return injectAssertion(signed, input.assertionXml);
}

/** Wstawia asercję SAML zaraz po otwarciu `<wsse:Security ...>` (token nośny). */
function injectAssertion(signedEnvelope: string, assertionXml: string): string {
  return signedEnvelope.replace(/(<wsse:Security\b[^>]*>)/, `$1${assertionXml}`);
}

/**
 * Wysyła indeks do rejestru P1 (ITI-42 RegisterDocumentSet-b) nad mTLS.
 * Zwraca status ebRS (Success/Failure) wraz z listą błędów rejestru.
 */
export async function registerDocumentSet(
  input: RegisterDocumentSetInput,
  httpClient: HttpClient,
): Promise<Result<RegisterDocumentSetResult, P1Error>> {
  const endpoint = input.endpoint ?? DEFAULT_ITI42_ENDPOINT;
  const body = buildRegisterDocumentSetRequest(input);

  let responseBody: string;
  try {
    const response = await httpClient.send({
      url: endpoint,
      method: "POST",
      headers: { "Content-Type": `application/soap+xml; charset=utf-8; action="${ACTION}"` },
      body,
    });
    responseBody = response.body;
  } catch (cause) {
    return err(new P1TransportError("ITI-42 RegisterDocumentSet request failed", { cause }));
  }

  const fault = /<(?:\w+:)?Fault\b[\s\S]*?<\/(?:\w+:)?Fault>/.test(responseBody);
  const status = /<(?:\w+:)?RegistryResponse\b[^>]*\bstatus="([^"]+)"/.exec(responseBody)?.[1];
  if (!status && fault) {
    return err(new P1BusinessError(faultMessage(responseBody)));
  }

  return ok({
    success: status === STATUS_SUCCESS,
    ...(status !== undefined ? { status } : {}),
    errors: parseErrors(responseBody),
    raw: responseBody,
  });
}

/** Parsuje RegistryErrorList -> lista błędów. */
function parseErrors(xml: string): RegistryError[] {
  const errors: RegistryError[] = [];
  const re = /<(?:\w+:)?RegistryError\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1] ?? "";
    errors.push({
      ...attrOf(attrs, "errorCode", "errorCode"),
      ...attrOf(attrs, "codeContext", "codeContext"),
      ...attrOf(attrs, "severity", "severity"),
      ...attrOf(attrs, "location", "location"),
    });
  }
  return errors;
}

function attrOf(attrs: string, name: string, key: keyof RegistryError): Partial<RegistryError> {
  const v = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1];
  return v !== undefined ? { [key]: v } : {};
}

function faultMessage(xml: string): string {
  const reason =
    /<(?:\w+:)?(?:Text|faultstring|Reason)[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:Text|faultstring|Reason)>/.exec(
      xml,
    )?.[1];
  return reason ? `ITI-42: ${reason.trim()}` : "ITI-42: błąd bez treści RegistryResponse";
}
