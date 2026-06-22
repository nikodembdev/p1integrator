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
import { buildSignedEdmEnvelope, SOAP11_NS } from "./soap-edm.js";

/**
 * SOZ - System Obsługi Zgód: weryfikacja uprawnień do udostępnienia dokumentacji
 * (`weryfikujDostepDoDanych`). Repozytorium, zanim wyda dokument (ITI-43), pyta P1
 * o decyzję XACML (Permit/Deny). Żądanie: XACMLAuthzDecisionQuery (XACML 3.0) z
 * atrybutami zasobu (dokument); strona żądająca i pacjent w asercji SAML (WS-Security,
 * profil sec1). SOAP 1.1, podpis X.509, nad mTLS.
 */

const SAMLP_XACML_NS = "urn:oasis:names:tc:xacml:3.0:profile:saml2.0:v2:schema:protocol:wd-13";
const XACML_CORE_NS = "urn:oasis:names:tc:xacml:3.0:core:schema:wd-17";
const RESOURCE_CATEGORY = "urn:oasis:names:tc:xacml:3.0:attribute-category:resource";
const STRING_TYPE = "http://www.w3.org/2001/XMLSchema#string";
const ACTION = "urn:weryfikujDostepDoDanych";

/** Atrybuty zasobu (dokumentacji) w żądaniu autoryzacji. */
const ATTR = {
  documentId: "urn:csioz:p1:autoryzacja:idDokumentu",
  documentType: "urn:csioz:p1:autoryzacja:typDokumentu",
  issuedFrom: "urn:csioz:p1:autoryzacja:dataWystawieniaOd",
  issuedTo: "urn:csioz:p1:autoryzacja:dataWystawieniaDo",
} as const;

/** Domyślny endpoint SOZ (środowisko integracyjne). */
export const DEFAULT_SOZ_ENDPOINT =
  "https://isus.ezdrowie.gov.pl/services/ObslugaWeryfikacjiDostepuDoDanychWS";

/** Decyzja XACML. */
export type AccessDecision = "Permit" | "Deny" | "NotApplicable" | "Indeterminate";

export interface VerifyAccessInput {
  readonly endpoint?: string;
  /** Asercja SAML (z `requestSamlToken`) - strona żądająca + pacjent. */
  readonly assertionXml: string;
  readonly wsSecurityCertificate: WsSecurityCertificate;
  /** Identyfikatory dokumentów do weryfikacji (idDokumentu). */
  readonly documentIds: readonly string[];
  /** Typ dokumentu (kod słownika P1) - opcjonalnie. */
  readonly documentType?: string;
  /** Zakres dat pochodzenia dokumentacji - opcjonalnie (ISO). */
  readonly issuedFrom?: string;
  readonly issuedTo?: string;
  readonly queryId?: string;
  readonly issueInstant?: Date;
  readonly now?: Date;
  readonly ttlSeconds?: number;
  readonly idSuffix?: string;
}

export interface VerifyAccessResult {
  /** Decyzja dla całego żądania (pierwszy Result). */
  readonly decision?: AccessDecision;
  /** Wszystkie decyzje (gdy wiele Result). */
  readonly decisions: readonly AccessDecision[];
  readonly raw: string;
}

const escapeXml = (v: string): string =>
  v.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);

function attribute(id: string, value: string): string {
  return (
    `<xacml:Attribute AttributeId="${id}" IncludeInResult="true">` +
    `<xacml:AttributeValue DataType="${STRING_TYPE}">${escapeXml(value)}</xacml:AttributeValue>` +
    `</xacml:Attribute>`
  );
}

/** Buduje podpisaną kopertę SOZ weryfikacji dostępu. */
export function buildVerifyAccessRequest(input: VerifyAccessInput): string {
  const queryId = input.queryId ?? `_${input.idSuffix ?? "query"}`;
  const issueInstant = (input.issueInstant ?? input.now ?? new Date()).toISOString();

  const attrs =
    input.documentIds.map((id) => attribute(ATTR.documentId, id)).join("") +
    (input.documentType ? attribute(ATTR.documentType, input.documentType) : "") +
    (input.issuedFrom ? attribute(ATTR.issuedFrom, input.issuedFrom) : "") +
    (input.issuedTo ? attribute(ATTR.issuedTo, input.issuedTo) : "");

  const bodyXml =
    `<samlp:XACMLAuthzDecisionQueryRequest xmlns:samlp="${SAMLP_XACML_NS}" xmlns:xacml="${XACML_CORE_NS}"` +
    ` ID="${escapeXml(queryId)}" Version="2" IssueInstant="${issueInstant}">` +
    `<xacml:Request ReturnPolicyIdList="false" CombinedDecision="false">` +
    `<xacml:Attributes Category="${RESOURCE_CATEGORY}">${attrs}</xacml:Attributes>` +
    `</xacml:Request>` +
    `</samlp:XACMLAuthzDecisionQueryRequest>`;

  return buildSignedEdmEnvelope({
    action: ACTION,
    endpoint: input.endpoint ?? DEFAULT_SOZ_ENDPOINT,
    bodyXml,
    assertionXml: input.assertionXml,
    certificate: input.wsSecurityCertificate,
    soapNamespace: SOAP11_NS,
    withWsAddressing: false,
    ...(input.now !== undefined ? { now: input.now } : {}),
    ...(input.ttlSeconds !== undefined ? { ttlSeconds: input.ttlSeconds } : {}),
    ...(input.idSuffix !== undefined ? { idSuffix: input.idSuffix } : {}),
  });
}

/**
 * Weryfikuje uprawnienie do udostępnienia dokumentów (SOZ `weryfikujDostepDoDanych`).
 * Zwraca decyzję XACML (Permit/Deny/...). Repozytorium woła to przed wydaniem treści.
 */
export async function verifyAccess(
  input: VerifyAccessInput,
  httpClient: HttpClient,
): Promise<Result<VerifyAccessResult, P1Error>> {
  const endpoint = input.endpoint ?? DEFAULT_SOZ_ENDPOINT;
  const body = buildVerifyAccessRequest(input);

  let responseBody: string;
  try {
    const response = await httpClient.send({
      url: endpoint,
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: ACTION },
      body,
    });
    responseBody = response.body;
  } catch (cause) {
    return err(new P1TransportError("SOZ weryfikujDostepDoDanych request failed", { cause }));
  }

  const decisions = [
    ...responseBody.matchAll(/<(?:[\w.-]+:)?Decision>([\s\S]*?)<\/(?:[\w.-]+:)?Decision>/g),
  ]
    .map((m) => m[1]?.trim())
    .filter((d): d is AccessDecision => d !== undefined);

  if (decisions.length === 0 && /Fault/.test(responseBody)) {
    return err(new P1BusinessError(faultMessage(responseBody)));
  }

  return ok({
    ...(decisions[0] !== undefined ? { decision: decisions[0] } : {}),
    decisions,
    raw: responseBody,
  });
}

function faultMessage(xml: string): string {
  const reason =
    /<(?:\w+:)?(?:faultstring|Text|Reason)[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:faultstring|Text|Reason)>/.exec(
      xml,
    )?.[1];
  return reason ? `SOZ: ${reason.trim()}` : "SOZ: brak decyzji w odpowiedzi";
}
