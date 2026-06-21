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

/**
 * SZAR - rejestracja repozytorium i danych dostępowych (model "własne repozytorium").
 * `rejestrujRepozytorium` nadaje repozytorium unikalny identyfikator; `rejestrujDaneDostepowe`
 * zapisuje parametry dostępu (m.in. publiczny adres usługi repo). SOAP 1.1, podpis
 * WS-Security X.509 (profil sec3, bez asercji SAML), nad mTLS.
 */

const SOAPENV_NS = "http://schemas.xmlsoap.org/soap/envelope/";
const WSU_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
const WSSE_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const WS_NS = "http://csioz.gov.pl/p1/szar/ws/v1";
const MT_NS = "http://csioz.gov.pl/p1/szar/mt/v1";
const ACTION_REGISTER_REPO = "urn:rejestrujRepozytorium";
const ACTION_REGISTER_ACCESS = "urn:rejestrujDaneDostepowe";

/** Klucz parametru danych dostępowych: publiczny adres usługi repozytorium. */
export const ACCESS_DATA_SERVICE_ADDRESS = "urn:csioz:p1:daneDostepowe:adresUslugi";

/** Domyślny endpoint SZAR (środowisko integracyjne). */
export const DEFAULT_SZAR_ENDPOINT =
  "https://isus.ezdrowie.gov.pl/services/ObslugaRejestrowanieDanychDostepowychWS";

export interface RegisterRepositoryInput {
  readonly endpoint?: string;
  readonly wsSecurityCertificate: WsSecurityCertificate;
  /** Wymuś utworzenie kolejnego repozytorium dla usługodawcy. */
  readonly forceNew?: boolean;
  readonly now?: Date;
  readonly ttlSeconds?: number;
  readonly idSuffix?: string;
}

export interface RegisterRepositoryResult {
  /** Nadany identyfikator repozytorium (do indeksów ITI-42). */
  readonly repositoryUniqueId?: string;
  /** Status operacji (SUKCES/BLAD). */
  readonly status?: string;
  readonly description?: string;
  readonly raw: string;
}

/** Parametr danych dostępowych (klucz -> wartość). */
export interface AccessDataParam {
  readonly key: string;
  readonly value: string;
}

export interface RegisterAccessDataInput {
  readonly endpoint?: string;
  readonly wsSecurityCertificate: WsSecurityCertificate;
  readonly repositoryUniqueId: string;
  /** Publiczny adres usługi repozytorium (ITI-43). */
  readonly serviceAddress: string;
  /** Dodatkowe parametry dostępu. */
  readonly extraParams?: readonly AccessDataParam[];
  readonly now?: Date;
  readonly ttlSeconds?: number;
  readonly idSuffix?: string;
}

export interface RegisterAccessDataResult {
  readonly status?: string;
  readonly description?: string;
  readonly raw: string;
}

const escapeXml = (v: string): string =>
  v.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);

/** Buduje i podpisuje (WSS X.509) kopertę SOAP 1.1 SZAR. */
function buildSzarEnvelope(
  bodyXml: string,
  certificate: WsSecurityCertificate,
  opts: { now?: Date; ttlSeconds?: number; idSuffix?: string },
): string {
  const envelope =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${SOAPENV_NS}" xmlns:wsu="${WSU_NS}"` +
    ` xmlns:v1="${WS_NS}" xmlns:v11="${MT_NS}">` +
    `<soapenv:Header><wsse:Security xmlns:wsse="${WSSE_NS}"></wsse:Security></soapenv:Header>` +
    `<soapenv:Body wsu:Id="Body">${bodyXml}</soapenv:Body>` +
    `</soapenv:Envelope>`;
  return signWsSecurity(envelope, {
    certificate,
    includeContextReference: false,
    ...(opts.now !== undefined ? { now: opts.now } : {}),
    ...(opts.ttlSeconds !== undefined ? { ttlSeconds: opts.ttlSeconds } : {}),
    ...(opts.idSuffix !== undefined ? { idSuffix: opts.idSuffix } : {}),
  });
}

async function send(
  endpoint: string,
  action: string,
  body: string,
  httpClient: HttpClient,
): Promise<Result<string, P1Error>> {
  try {
    const response = await httpClient.send({
      url: endpoint,
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: action },
      body,
    });
    return ok(response.body);
  } catch (cause) {
    return err(new P1TransportError(`SZAR (${action}) request failed`, { cause }));
  }
}

const el = (xml: string, name: string): string | undefined =>
  new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(xml)?.[1]?.trim();

/** Rejestruje repozytorium w P1 (nadaje identyfikator repozytorium). */
export async function registerRepository(
  input: RegisterRepositoryInput,
  httpClient: HttpClient,
): Promise<Result<RegisterRepositoryResult, P1Error>> {
  const endpoint = input.endpoint ?? DEFAULT_SZAR_ENDPOINT;
  const bodyXml =
    `<v1:RejestrowanieRepozytoriumRequest>` +
    (input.forceNew
      ? `<v11:wymusUtworzenieNowegoRepozytorium>true</v11:wymusUtworzenieNowegoRepozytorium>`
      : "") +
    `</v1:RejestrowanieRepozytoriumRequest>`;
  const signed = buildSzarEnvelope(bodyXml, input.wsSecurityCertificate, input);

  const res = await send(endpoint, ACTION_REGISTER_REPO, signed, httpClient);
  if (!res.ok) return res;
  const status = el(res.value, "status");
  if (status === undefined && /Fault/.test(res.value)) {
    return err(new P1BusinessError(faultMessage(res.value)));
  }
  return ok({
    ...textIf("repositoryUniqueId", el(res.value, "identyfikatorRepozytorium")),
    ...textIf("status", status),
    ...textIf("description", el(res.value, "opis")),
    raw: res.value,
  });
}

/** Rejestruje/aktualizuje dane dostępowe repozytorium (adres usługi + parametry). */
export async function registerAccessData(
  input: RegisterAccessDataInput,
  httpClient: HttpClient,
): Promise<Result<RegisterAccessDataResult, P1Error>> {
  const endpoint = input.endpoint ?? DEFAULT_SZAR_ENDPOINT;
  const params = [
    { key: ACCESS_DATA_SERVICE_ADDRESS, value: input.serviceAddress },
    ...(input.extraParams ?? []),
  ];
  const bodyXml =
    `<v1:RejestrowanieDanychDostepowychRequest><v11:daneDostepowe>` +
    `<v11:identyfikatorRepozytorium>${escapeXml(input.repositoryUniqueId)}</v11:identyfikatorRepozytorium>` +
    params
      .map((p) => `<v11:parametr klucz="${escapeXml(p.key)}" wartosc="${escapeXml(p.value)}"/>`)
      .join("") +
    `</v11:daneDostepowe></v1:RejestrowanieDanychDostepowychRequest>`;
  const signed = buildSzarEnvelope(bodyXml, input.wsSecurityCertificate, input);

  const res = await send(endpoint, ACTION_REGISTER_ACCESS, signed, httpClient);
  if (!res.ok) return res;
  const status = el(res.value, "status");
  if (status === undefined && /Fault/.test(res.value)) {
    return err(new P1BusinessError(faultMessage(res.value)));
  }
  return ok({
    ...textIf("status", status),
    ...textIf("description", el(res.value, "opis")),
    raw: res.value,
  });
}

function textIf(key: "repositoryUniqueId" | "status" | "description", v: string | undefined) {
  return v !== undefined ? { [key]: v } : {};
}

function faultMessage(xml: string): string {
  const reason =
    /<(?:\w+:)?(?:faultstring|Text|Reason|opis)[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:faultstring|Text|Reason|opis)>/.exec(
      xml,
    )?.[1];
  return reason ? `SZAR: ${reason.trim()}` : "SZAR: błąd bez treści";
}
