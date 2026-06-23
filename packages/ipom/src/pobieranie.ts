import {
  err,
  ok,
  type OperationOutcome,
  type P1Error,
  P1TransportError,
  type Result,
} from "@p1/core";
import { buildSoapEnvelope, parseSoapResponse, SOAP12_NS, signWsSecurity } from "@p1/transport";
import { IPOM_WS_NS, type IpomTransport } from "./submit.js";
import { collectRecords, fieldText, findText } from "./xml-walk.js";

/** Namespace typów wspólnych P1 (IdentyfikatorOIDMT, WlasciwosciWyszukiwaniaMT). */
const WSPOLNE_NS = "http://csioz.gov.pl/p1/wspolne/mt/v20180509";

/** Identyfikator OID P1 (`root` + `extension`). */
export interface IpomOid {
  readonly root: string;
  readonly extension: string;
}

/** Status dokumentu planu/harmonogramu. */
export type IpomDocumentStatus = "OBOWIAZUJACY" | "ANULOWANY";

/** Wynik odczytu dokumentu (plan/harmonogram) - treść CDA + status. */
export interface IpomReadResult {
  /** Treść dokumentu CDA (zdekodowana z base64), o ile zwrócona. */
  readonly cdaXml?: string;
  /** Status dokumentu (`OBOWIAZUJACY`/`ANULOWANY`). */
  readonly status?: string;
  /** Identyfikator aktualnego planu (tylko dla odczytu aktualnego harmonogramu). */
  readonly currentPlanId?: IpomOid;
  readonly outcome?: OperationOutcome;
}

/** Pojedynczy wynik wyszukiwania planów opieki medycznej. */
export interface IpomSearchHit {
  readonly planId?: IpomOid;
  readonly authorId?: IpomOid;
  readonly authorName?: string;
  readonly authorOrganizationId?: IpomOid;
  readonly issuedAt?: string;
  readonly versionNumber?: string;
  readonly status?: string;
}

export interface IpomSearchResult {
  readonly documents: readonly IpomSearchHit[];
  /** Całkowita liczba dokumentów spełniających kryteria. */
  readonly totalCount?: string;
  /** Liczba stron wyników. */
  readonly pageCount?: string;
  readonly outcome?: OperationOutcome;
}

/** Pojedyncza wersja historyczna dokumentu. */
export interface IpomVersionHit {
  readonly versionSetId?: IpomOid;
  readonly versionNumber?: string;
  readonly authorId?: IpomOid;
  readonly authorName?: string;
  readonly authorOrganizationId?: IpomOid;
  readonly issuedAt?: string;
}

export interface IpomVersionListResult {
  readonly versions: readonly IpomVersionHit[];
  readonly outcome?: OperationOutcome;
}

/** Kryteria wyszukiwania planów opieki medycznej. */
export interface IpomSearchParams {
  /** Usługobiorca (pacjent) - wymagany przy wyszukiwaniu usługobiorcy, opcjonalny u wystawcy. */
  readonly patient?: IpomOid;
  /** Wystawca (autor) - filtr opcjonalny. */
  readonly author?: IpomOid;
  /** Podmiot wystawcy - filtr opcjonalny. */
  readonly authorOrganization?: IpomOid;
  /** Data wystawienia od (dateTime, np. „2026-01-01T00:00:00"). */
  readonly issuedFrom?: string;
  /** Data wystawienia do. */
  readonly issuedTo?: string;
  /** Status dokumentu. */
  readonly status?: IpomDocumentStatus;
  /** Numer strony (od 0; domyślnie 0). */
  readonly page?: number;
  /** Liczba wyników na stronie (opcjonalnie). */
  readonly pageSize?: number;
}

// --- Operacje odczytowe -----------------------------------------------------

/** Odczyt planu opieki medycznej po identyfikatorze dokumentu (`odczytPlanuOpiekiMedycznej`). */
export async function readIpomPlan(
  documentId: IpomOid,
  transport: IpomTransport,
): Promise<Result<IpomReadResult, P1Error>> {
  const body = oidElement("identyfikatorDokumentu", documentId);
  return sendQuery(
    "OdczytPlanuOpiekiMedycznejRequest",
    body,
    "urn:odczytPlanuOpiekiMedycznej",
    transport,
  ).then((r) => (r.ok ? ok(parseReadResult(r.value.body, r.value.outcome)) : r));
}

/**
 * Odczyt aktualnego harmonogramu dla planu (`odczytAktualnegoHarmonogramuPlanuOpiekiMedycznej`)
 * - po identyfikatorze zbioru wersji planu.
 */
export async function readCurrentSchedule(
  planVersionSetId: IpomOid,
  transport: IpomTransport,
): Promise<Result<IpomReadResult, P1Error>> {
  const body = oidElement("identyfikatorZbioruWersji", planVersionSetId);
  return sendQuery(
    "OdczytAktualnegoHarmonogramuPlanuOpiekiMedycznejRequest",
    body,
    "urn:odczytAktualnegoHarmonogramuPlanuOpiekiMedycznej",
    transport,
  ).then((r) => (r.ok ? ok(parseReadResult(r.value.body, r.value.outcome)) : r));
}

/** Wyszukanie planów usługobiorcy (`wyszukaniePlanowOpiekiMedycznejUslugobiorcy`). */
export function searchPatientPlans(
  params: IpomSearchParams,
  transport: IpomTransport,
): Promise<Result<IpomSearchResult, P1Error>> {
  return searchPlans(
    "WyszukaniePlanowOpiekiMedycznejUslugobiorcyRequest",
    "urn:wyszukaniePlanowOpiekiMedycznejUslugobiorcy",
    params,
    transport,
  );
}

/** Wyszukanie planów wystawcy (`wyszukaniePlanowOpiekiMedycznejWystawcy`). */
export function searchAuthorPlans(
  params: IpomSearchParams,
  transport: IpomTransport,
): Promise<Result<IpomSearchResult, P1Error>> {
  return searchPlans(
    "WyszukaniePlanowOpiekiMedycznejWystawcyRequest",
    "urn:wyszukaniePlanowOpiekiMedycznejWystawcy",
    params,
    transport,
  );
}

/** Lista wersji historycznych planu (`pobranieListyWersjiHistorycznychPlanuOpiekiMedycznej`). */
export function listPlanVersions(
  documentId: IpomOid,
  transport: IpomTransport,
  page = 0,
): Promise<Result<IpomVersionListResult, P1Error>> {
  return listVersions(
    "PobranieListyWersjiHistorycznychPlanuOpiekiMedycznejRequest",
    "urn:pobranieListyWersjiHistorycznychPlanuOpiekiMedycznej",
    documentId,
    page,
    transport,
  );
}

/** Lista wersji historycznych harmonogramu (`pobranieListyWersjiHistorycznychHarmonogramuPlanuOpiekiMedycznej`). */
export function listScheduleVersions(
  documentId: IpomOid,
  transport: IpomTransport,
  page = 0,
): Promise<Result<IpomVersionListResult, P1Error>> {
  return listVersions(
    "PobranieListyWersjiHistorycznychHarmonogramuPlanuOpiekiMedycznejRequest",
    "urn:pobranieListyWersjiHistorycznychHarmonogramuPlanuOpiekiMedycznej",
    documentId,
    page,
    transport,
  );
}

/** Odczyt wersji historycznej planu (`odczytWersjiHistorycznejPlanuOpiekiMedycznej`). */
export function readPlanVersion(
  versionSetId: IpomOid,
  versionNumber: number,
  transport: IpomTransport,
): Promise<Result<IpomReadResult, P1Error>> {
  return readVersion(
    "OdczytWersjiHistorycznejPlanuOpiekiMedycznejRequest",
    "urn:odczytWersjiHistorycznejPlanuOpiekiMedycznej",
    versionSetId,
    versionNumber,
    transport,
  );
}

/** Odczyt wersji historycznej harmonogramu (`odczytWersjiHistorycznejHarmonogramuPlanuOpiekiMedycznej`). */
export function readScheduleVersion(
  versionSetId: IpomOid,
  versionNumber: number,
  transport: IpomTransport,
): Promise<Result<IpomReadResult, P1Error>> {
  return readVersion(
    "OdczytWersjiHistorycznejHarmonogramuPlanuOpiekiMedycznejRequest",
    "urn:odczytWersjiHistorycznejHarmonogramuPlanuOpiekiMedycznej",
    versionSetId,
    versionNumber,
    transport,
  );
}

// --- Wspólna logika ---------------------------------------------------------

async function searchPlans(
  requestRoot: string,
  soapAction: string,
  params: IpomSearchParams,
  transport: IpomTransport,
): Promise<Result<IpomSearchResult, P1Error>> {
  let body = "";
  if (params.issuedFrom)
    body += `<dataWystawieniaOd>${escapeXml(params.issuedFrom)}</dataWystawieniaOd>`;
  if (params.issuedTo)
    body += `<dataWystawieniaDo>${escapeXml(params.issuedTo)}</dataWystawieniaDo>`;
  if (params.patient) body += oidElement("identyfikatorUslugobiorcy", params.patient);
  if (params.author) body += oidElement("identyfikatorAutora", params.author);
  if (params.authorOrganization)
    body += oidElement("identyfikatorPodmiotuAutora", params.authorOrganization);
  if (params.status) body += `<statusDokumentu>${params.status}</statusDokumentu>`;
  body += searchProperties(params.page ?? 0, params.pageSize);

  const result = await sendQuery(requestRoot, body, soapAction, transport);
  if (!result.ok) return result;
  return ok(parseSearchResult(result.value.body, result.value.outcome));
}

async function listVersions(
  requestRoot: string,
  soapAction: string,
  documentId: IpomOid,
  page: number,
  transport: IpomTransport,
): Promise<Result<IpomVersionListResult, P1Error>> {
  const body =
    oidElement("identyfikatorDokumentu", documentId) +
    searchProperties(page, undefined, "wlasciwosciPobierania");
  const result = await sendQuery(requestRoot, body, soapAction, transport);
  if (!result.ok) return result;
  return ok(parseVersionList(result.value.body, result.value.outcome));
}

async function readVersion(
  requestRoot: string,
  soapAction: string,
  versionSetId: IpomOid,
  versionNumber: number,
  transport: IpomTransport,
): Promise<Result<IpomReadResult, P1Error>> {
  const body =
    oidElement("identyfikatorZbioruWersji", versionSetId) +
    `<numerWersji>${versionNumber}</numerWersji>`;
  const result = await sendQuery(requestRoot, body, soapAction, transport);
  if (!result.ok) return result;
  return ok(parseReadResult(result.value.body, result.value.outcome));
}

interface QueryResponse {
  readonly body: unknown;
  readonly outcome?: OperationOutcome;
}

async function sendQuery(
  requestRoot: string,
  bodyInner: string,
  soapAction: string,
  transport: IpomTransport,
): Promise<Result<QueryResponse, P1Error>> {
  const envelope = buildSoapEnvelope({
    context: transport.context,
    body: `<ws:${requestRoot}>${bodyInner}</ws:${requestRoot}>`,
    namespaces: { ws: IPOM_WS_NS, wsp: WSPOLNE_NS },
    soapNamespace: SOAP12_NS,
  });

  const now = transport.clock?.now();
  const signed = signWsSecurity(
    envelope,
    now !== undefined
      ? { certificate: transport.wsSecurityCertificate, now }
      : { certificate: transport.wsSecurityCertificate },
  );

  let responseBody: string;
  try {
    const response = await transport.httpClient.send({
      url: transport.endpoint,
      method: "POST",
      headers: { "Content-Type": `application/soap+xml; charset=utf-8; action="${soapAction}"` },
      body: signed,
    });
    responseBody = response.body;
  } catch (cause) {
    return err(new P1TransportError("IPOM query request failed", { cause }));
  }

  const parsed = parseSoapResponse(responseBody);
  if (!parsed.ok) return parsed;
  return ok({
    body: parsed.value.body,
    ...(parsed.value.outcome !== undefined ? { outcome: parsed.value.outcome } : {}),
  });
}

/** Element `wlasciwosciWyszukiwania`/`wlasciwosciPobierania` (strona + opcjonalnie rozmiar). */
function searchProperties(
  page: number,
  pageSize?: number,
  wrapper = "wlasciwosciWyszukiwania",
): string {
  let inner = `<wsp:numerStrony>${page}</wsp:numerStrony>`;
  if (pageSize !== undefined)
    inner += `<wsp:liczbaWynikowNaStronie>${pageSize}</wsp:liczbaWynikowNaStronie>`;
  return `<${wrapper}>${inner}</${wrapper}>`;
}

/** Element wrappera z OID-em w polach `wsp:extension`/`wsp:root`. */
function oidElement(wrapper: string, value: IpomOid): string {
  return (
    `<${wrapper}>` +
    `<wsp:extension>${escapeXml(value.extension)}</wsp:extension>` +
    `<wsp:root>${escapeXml(value.root)}</wsp:root>` +
    `</${wrapper}>`
  );
}

function parseReadResult(body: unknown, outcome?: OperationOutcome): IpomReadResult {
  const tresc = findText(body, "trescDokumentu");
  const status = findText(body, "statusDokumentu");
  const currentPlanId = parseOid(findFirst(body, "identyfikatorAktualnegoIPOM"), undefined);
  return {
    ...(tresc !== undefined ? { cdaXml: Buffer.from(tresc, "base64").toString("utf8") } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(currentPlanId !== undefined ? { currentPlanId } : {}),
    ...(outcome !== undefined ? { outcome } : {}),
  };
}

function parseSearchResult(body: unknown, outcome?: OperationOutcome): IpomSearchResult {
  const documents = collectRecords(body, "dokument").map((node) => ({
    ...optional("planId", parseOid(node, "identyfikatorPlanuOpiekiMedycznej")),
    ...optional("authorId", parseOid(node, "identyfikatorAutora")),
    ...optional("authorName", fieldText(node, "nazwaAutora")),
    ...optional("authorOrganizationId", parseOid(node, "identyfikatorPodmiotuAutora")),
    ...optional("issuedAt", fieldText(node, "dataWystawienia")),
    ...optional("versionNumber", fieldText(node, "numerWersji")),
    ...optional("status", fieldText(node, "statusDokumentu")),
  }));
  return {
    documents,
    ...optional("totalCount", findText(body, "liczbaDokumentow")),
    ...optional("pageCount", findText(body, "liczbaStron")),
    ...(outcome !== undefined ? { outcome } : {}),
  };
}

function parseVersionList(body: unknown, outcome?: OperationOutcome): IpomVersionListResult {
  const versions = collectRecords(body, "dokument").map((node) => ({
    ...optional("versionSetId", parseOid(node, "identyfikatorZbioruWersji")),
    ...optional("versionNumber", fieldText(node, "numerWersji")),
    ...optional("authorId", parseOid(node, "identyfikatorAutora")),
    ...optional("authorName", fieldText(node, "nazwaAutora")),
    ...optional("authorOrganizationId", parseOid(node, "identyfikatorPodmiotuAutora")),
    ...optional("issuedAt", fieldText(node, "dataWystawienia")),
  }));
  return { versions, ...(outcome !== undefined ? { outcome } : {}) };
}

/** Wyciąga OID (`extension`+`root`) z pola `key` węzła (lub z samego węzła, gdy `key` pominięto). */
function parseOid(node: unknown, key: string | undefined): IpomOid | undefined {
  const target = key === undefined ? node : (node as Record<string, unknown> | null)?.[key];
  if (target !== null && typeof target === "object") {
    const extension = fieldText(target, "extension");
    const root = fieldText(target, "root");
    if (extension !== undefined && root !== undefined) return { extension, root };
  }
  return undefined;
}

/** Pierwszy węzeł o danym kluczu (do wyciągnięcia zagnieżdżonego OID). */
function findFirst(node: unknown, key: string): unknown {
  return collectRecords(node, key)[0];
}

function optional<T>(key: string, value: T | undefined): Record<string, T> {
  return value !== undefined ? { [key]: value } : {};
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) =>
    char === "<"
      ? "&lt;"
      : char === ">"
        ? "&gt;"
        : char === "&"
          ? "&amp;"
          : char === '"'
            ? "&quot;"
            : "&apos;",
  );
}
