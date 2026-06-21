import {
  err,
  type HttpClient,
  ok,
  type P1Error,
  P1BusinessError,
  P1TransportError,
  type Result,
} from "@p1/core";
import type { WsSecurityCertificate } from "@p1/transport";
import { buildRegistryObjectList, type DocumentIndexInput } from "./ebrim.js";
import { buildSignedEdmEnvelope, EBRS_STATUS_SUCCESS, soap12ContentType } from "./soap-edm.js";

/**
 * ITI-42 (Register Document Set-b) - zapis indeksu EDM w rejestrze P1.
 * Koperta SOAP 1.2 z `lcm:SubmitObjectsRequest`, asercja SAML w nagłówku WS-Security
 * + podpis X.509 (Body+Timestamp), WS-Addressing, nad mTLS. Odpowiedź: ebRS RegistryResponse.
 */

const LCM_NS = "urn:oasis:names:tc:ebxml-regrep:xsd:lcm:3.0";
const ACTION = "urn:ihe:iti:2007:RegisterDocumentSet-b";

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

/** Buduje podpisaną kopertę ITI-42 z osadzoną asercją SAML. */
export function buildRegisterDocumentSetRequest(input: RegisterDocumentSetInput): string {
  return buildSignedEdmEnvelope({
    action: ACTION,
    endpoint: input.endpoint ?? DEFAULT_ITI42_ENDPOINT,
    bodyXml: `<lcm:SubmitObjectsRequest>${buildRegistryObjectList(input.index)}</lcm:SubmitObjectsRequest>`,
    assertionXml: input.assertionXml,
    certificate: input.wsSecurityCertificate,
    namespaces: { lcm: LCM_NS },
    ...(input.now !== undefined ? { now: input.now } : {}),
    ...(input.ttlSeconds !== undefined ? { ttlSeconds: input.ttlSeconds } : {}),
    ...(input.idSuffix !== undefined ? { idSuffix: input.idSuffix } : {}),
    ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
  });
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
      headers: { "Content-Type": soap12ContentType(ACTION) },
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
    success: status === EBRS_STATUS_SUCCESS,
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
