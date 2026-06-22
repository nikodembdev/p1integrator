import {
  type CallContext,
  err,
  type HttpClient,
  ok,
  type P1Error,
  P1BusinessError,
  P1TransportError,
  type Result,
} from "@p1/core";
import { signWsSecurity, type WsSecurityCertificate } from "@p1/transport";
import type { AccessMode, OidIdentifier } from "./types.js";

/**
 * Token SAML dla EDM (operacja `generujToken`, WS-Trust 1.3 RST/Issue). Dane o
 * stronie (podmiot, użytkownik, miejsce, pacjent, rola, tryb) przekazuje się jako
 * `saml:Attribute` w `saml:AttributeStatement` wewnątrz RST (XSPA/XACML), wartości
 * w formacie `root#extension`. Żądanie podpisane WS-Security X.509, nad mTLS.
 * Zwrócona asercja SAML trafia do nagłówka WS-Security operacji EDM (ITI-18/42/57/41/43).
 */

const WST_NS = "http://docs.oasis-open.org/ws-sx/ws-trust/200512/";
const WSA_NS = "http://www.w3.org/2005/08/addressing";
const WSP_NS = "http://schemas.xmlsoap.org/ws/2004/09/policy";
const SAML2_NS = "urn:oasis:names:tc:SAML:2.0:assertion";
const EDM_NS = "http://csioz.gov.pl/p1/edm";
const SOAPENV_NS = "http://schemas.xmlsoap.org/soap/envelope/";
const WSU_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
const WSSE_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";

const RST_ISSUE_ACTION = "http://docs.oasis-open.org/ws-sx/ws-trust/200512/RST/Issue";
const RST_ISSUE = "http://docs.oasis-open.org/ws-sx/ws-trust/200512/Issue";
const TOKEN_TYPE_SAML2 = "http://docs.oasis-open.org/wss/oasis-wss-saml-tokenprofile-1.1#SAMLV2.0";
/** Domyślna klasa uwierzytelnienia (zgodnie z przykładami P1). */
const AUTHN_DEFAULT = "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport";

/** Nazwy atrybutów tokenu (XSPA/XACML). */
const ATTR = {
  organizationId: "urn:oasis:names:tc:xspa:1.0:subject:organization-id",
  childOrganization: "urn:oasis:names:tc:xspa:1.0:subject:child-organization",
  subjectId: "urn:oasis:names:tc:SAML:attribute:subject-id",
  resourceId: "urn:oasis:names:tc:xacml:1.0:resource:resource-id",
  functionalRole: "urn:oasis:names:tc:xspa:1.0:subject:functional-role",
  purpose: "urn:oasis:names:tc:xacml:2.0:action:purpose",
  actionId: "urn:oasis:names:tc:xacml:1.0:action:action-id",
  sourceOrganization: "urn:p1:source-organization",
} as const;

/** Rola biznesowa -> wartość `functional-role` w tokenie. */
const FUNCTIONAL_ROLE: Record<CallContext["businessRole"], string> = {
  DOCTOR: "medical doctor",
  NURSE_MIDWIFE: "nurse",
  PHARMACIST: "pharmacist",
  PHARMACY_TECHNICIAN: "medical professional",
  LAB_DIAGNOSTICIAN: "laboratory diagnostician",
  PHYSIOTHERAPIST: "physiotherapist",
  OTHER_MEDICAL_PROFESSIONAL: "medical professional",
  ADMINISTRATIVE_STAFF: "administrative employee",
  PATIENT: "patient",
  PROXY: "plenipotentiary",
  GUARDIAN: "legal guardian",
};

/** Tryb dostępu -> kod `purpose` (PurposeOfUse / kody dedykowane P1). */
const PURPOSE: Record<AccessMode, string> = {
  NORMAL: "TREAT",
  BTG: "BTG",
  CONTT: "CONTT",
};

/** Domyślny endpoint usługi tokenu (środowisko integracyjne). */
export const DEFAULT_SAML_TOKEN_ENDPOINT =
  "https://isus.ezdrowie.gov.pl/services/ObslugaGenerowanieTokenuSamlWS";

export interface SamlTokenRequest {
  /** Endpoint usługi `generujToken`. */
  readonly endpoint?: string;
  /** Kontekst wywołania (podmiot/użytkownik/miejsce/rola) - źródło atrybutów tokenu. */
  readonly context: CallContext;
  /** Certyfikat WSS (podpis X.509 koperty). */
  readonly wsSecurityCertificate: WsSecurityCertificate;
  /** Pacjent, którego dotyczą dane (opcjonalnie). */
  readonly patient?: OidIdentifier;
  /** Tryb dostępu (domyślnie NORMAL). */
  readonly accessMode?: AccessMode;
  /** Podmiot, w imieniu którego realizowany jest dostęp (np. oddział NFZ). */
  readonly sourceOrganization?: OidIdentifier;
  /** Czas uwierzytelnienia użytkownika (AuthnInstant); domyślnie `now`. */
  readonly authnInstant?: Date;
  /** Klasa uwierzytelnienia (AuthnContextClassRef); domyślnie PasswordProtectedTransport. */
  readonly authnContextClassRef?: string;
  /** Czy dodać `wsp:AppliesTo`/`edm:WymianaEDM` (opcjonalne; domyślnie pominięte). */
  readonly appliesToEdm?: boolean;
  /** Znacznik czasu (deterministyczne testy). */
  readonly now?: Date;
  readonly ttlSeconds?: number;
  readonly idSuffix?: string;
  readonly messageId?: string;
}

export interface SamlToken {
  /** Surowy element `<saml:Assertion>` (oktety) do wstawienia w WS-Security. */
  readonly assertionXml: string;
  readonly assertionId?: string;
  readonly notOnOrAfter?: string;
  readonly raw: string;
}

const escapeXml = (v: string): string =>
  v.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);

/** Atrybut tokenu: `<saml:Attribute Name="..."><saml:AttributeValue xsi:type="xs:string">...`. */
function attribute(name: string, value: string): string {
  return (
    `<saml:Attribute Name="${name}">` +
    `<saml:AttributeValue xsi:type="xs:string">${escapeXml(value)}</saml:AttributeValue>` +
    `</saml:Attribute>`
  );
}

/** Wartość identyfikatora OID w tokenie: `root#extension`. */
const oidValue = (id: OidIdentifier): string => `${id.root}#${id.extension}`;

/** Buduje (i podpisuje WS-Security) kopertę żądania tokenu SAML. */
export function buildSamlTokenRequest(input: SamlTokenRequest): string {
  const endpoint = input.endpoint ?? DEFAULT_SAML_TOKEN_ENDPOINT;
  const now = input.now ?? new Date();
  const messageId = input.messageId ?? `urn:uuid:${input.idSuffix ?? "message"}`;
  const authnInstant = (input.authnInstant ?? now).toISOString();
  const accessMode = input.accessMode ?? "NORMAL";
  const { context } = input;

  const attributes =
    attribute(ATTR.organizationId, oidValue(context.subject)) +
    attribute(ATTR.childOrganization, oidValue(context.workplace)) +
    attribute(ATTR.subjectId, oidValue(context.user)) +
    (input.patient ? attribute(ATTR.resourceId, oidValue(input.patient)) : "") +
    attribute(ATTR.functionalRole, FUNCTIONAL_ROLE[context.businessRole]) +
    attribute(ATTR.purpose, PURPOSE[accessMode]) +
    (input.sourceOrganization
      ? attribute(ATTR.sourceOrganization, oidValue(input.sourceOrganization))
      : "");

  const body =
    `<wst:RequestSecurityToken xmlns:wst="${WST_NS}" xmlns:wsp="${WSP_NS}"` +
    ` xmlns:saml="${SAML2_NS}" xmlns:edm="${EDM_NS}"` +
    ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xs="http://www.w3.org/2001/XMLSchema">` +
    `<wst:RequestType>${RST_ISSUE}</wst:RequestType>` +
    `<wst:TokenType>${TOKEN_TYPE_SAML2}</wst:TokenType>` +
    (input.appliesToEdm ? `<wsp:AppliesTo><edm:WymianaEDM/></wsp:AppliesTo>` : "") +
    `<saml:AuthnStatement AuthnInstant="${authnInstant}">` +
    `<saml:AuthnContext>` +
    `<saml:AuthnContextClassRef>${input.authnContextClassRef ?? AUTHN_DEFAULT}</saml:AuthnContextClassRef>` +
    `</saml:AuthnContext>` +
    `</saml:AuthnStatement>` +
    `<saml:AttributeStatement>${attributes}</saml:AttributeStatement>` +
    `</wst:RequestSecurityToken>`;

  const envelope =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${SOAPENV_NS}" xmlns:wsu="${WSU_NS}">` +
    `<soapenv:Header>` +
    `<wsa:Action xmlns:wsa="${WSA_NS}">${RST_ISSUE_ACTION}</wsa:Action>` +
    `<wsa:To xmlns:wsa="${WSA_NS}">${escapeXml(endpoint)}</wsa:To>` +
    `<wsa:MessageID xmlns:wsa="${WSA_NS}">${escapeXml(messageId)}</wsa:MessageID>` +
    `<wsse:Security xmlns:wsse="${WSSE_NS}"></wsse:Security>` +
    `</soapenv:Header>` +
    `<soapenv:Body wsu:Id="Body">${body}</soapenv:Body>` +
    `</soapenv:Envelope>`;

  return signWsSecurity(envelope, {
    certificate: input.wsSecurityCertificate,
    includeContextReference: false,
    ...(input.now !== undefined ? { now: input.now } : {}),
    ...(input.ttlSeconds !== undefined ? { ttlSeconds: input.ttlSeconds } : {}),
    ...(input.idSuffix !== undefined ? { idSuffix: input.idSuffix } : {}),
  });
}

/**
 * Pobiera token SAML z usługi `generujToken` (WS-Trust RST/Issue) nad mTLS.
 * Zwraca surową asercję SAML 2.0 do wstawienia w nagłówek WS-Security operacji EDM.
 */
export async function requestSamlToken(
  input: SamlTokenRequest,
  httpClient: HttpClient,
): Promise<Result<SamlToken, P1Error>> {
  const endpoint = input.endpoint ?? DEFAULT_SAML_TOKEN_ENDPOINT;
  const body = buildSamlTokenRequest(input);

  let responseBody: string;
  try {
    const response = await httpClient.send({
      url: endpoint,
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: RST_ISSUE_ACTION },
      body,
    });
    responseBody = response.body;
  } catch (cause) {
    return err(new P1TransportError("SAML token request failed", { cause }));
  }

  const assertion = extractAssertion(responseBody);
  if (!assertion) {
    return err(new P1BusinessError(faultMessage(responseBody)));
  }
  return ok(assertion);
}

/** Wyciąga surowy element `<...:Assertion>` z odpowiedzi RSTRC. */
export function extractAssertion(responseXml: string): SamlToken | undefined {
  const match = /<(\w+:)?Assertion[ >][\s\S]*?<\/(\w+:)?Assertion>/.exec(responseXml);
  if (!match) return undefined;
  const assertionXml = match[0];
  const assertionId = /\bID="([^"]+)"/.exec(assertionXml)?.[1];
  const notOnOrAfter = /NotOnOrAfter="([^"]+)"/.exec(assertionXml)?.[1];
  return {
    assertionXml,
    ...(assertionId !== undefined ? { assertionId } : {}),
    ...(notOnOrAfter !== undefined ? { notOnOrAfter } : {}),
    raw: responseXml,
  };
}

/** Czytelny komunikat z odpowiedzi błędnej (SOAP Fault / opis błędu P1). */
function faultMessage(responseXml: string): string {
  const opis = /<(?:\w+:)?opis>([\s\S]*?)<\/(?:\w+:)?opis>/.exec(responseXml)?.[1];
  if (opis) return `SAML token: ${opis.trim()}`;
  const reason =
    /<(?:\w+:)?(?:faultstring|Text|Reason)[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:faultstring|Text|Reason)>/.exec(
      responseXml,
    )?.[1];
  return reason ? `SAML token: ${reason.trim()}` : "SAML token: brak asercji w odpowiedzi";
}
