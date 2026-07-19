import {
  err,
  ok,
  type HttpClient,
  type OperationOutcome,
  type P1Error,
  P1AuthenticationError,
  P1AuthorizationError,
  P1BusinessError,
  P1ServerError,
  P1TransportError,
  P1ValidationError,
  type Result,
} from "@p1/core";
import { SGOA_RULE } from "./constants.js";

/**
 * Niskopoziomowy klient REST serwera FHIR SGO-A. Kontekst wywołania (rola,
 * placówka, użytkownik) siedzi w tokenie - INACZEJ niż w ZM/Patient Summary
 * nie ma nagłówków `KontekstUzytkownika`/`Identyfikator-Pacjenta`.
 */
export interface SgoaClient {
  /** GET /{resourceType}/{id}. */
  read(resourceType: string, id: string): Promise<Result<unknown, P1Error>>;
  /** POST zasobu FHIR (JSON) pod /{resourceType} - id nadaje serwer. */
  create(resourceType: string, resource: unknown): Promise<Result<unknown, P1Error>>;
  /** PUT /{resourceType}/{id} - pełny zaktualizowany zasób w body. */
  update(resourceType: string, id: string, resource: unknown): Promise<Result<unknown, P1Error>>;
  /** GET /{resourceType}?{query} - zwraca surowy Bundle (searchset). */
  search(resourceType: string, query: SgoaQuery): Promise<Result<unknown, P1Error>>;
  /** GET pod ścieżkę względną lub pełny URL (operacje `$...`, kolejne strony). */
  get(pathOrUrl: string): Promise<Result<unknown, P1Error>>;
}

/** Parametry zapytania - wartość powtórzona dla tablicy (np. `created=ge...&created=le...`). */
export type SgoaQuery = Readonly<Record<string, string | readonly string[] | undefined>>;

export interface SgoaClientOptions {
  /** Bazowy adres serwera FHIR SGO-A, np. `https://isus.ezdrowie.gov.pl/sgoa/fhir`. */
  readonly baseUrl: string;
  /** Token dostępu (Bearer) z OAuth2 (scope `fhir-sgoa`). */
  readonly accessToken: string;
  /** Klient HTTP z mTLS. */
  readonly httpClient: HttpClient;
  /** Język odpowiedzi (`Accept-Language`); bez ustawienia - polski. */
  readonly language?: "en" | "uk";
}

const FHIR_JSON = "application/fhir+json";

export function createSgoaClient(options: SgoaClientOptions): SgoaClient {
  const base = options.baseUrl.replace(/\/$/, "");
  const headers = (extra?: Record<string, string>): Record<string, string> => ({
    Authorization: `Bearer ${options.accessToken}`,
    Accept: FHIR_JSON,
    ...(options.language ? { "Accept-Language": options.language } : {}),
    ...extra,
  });

  const send = async (
    request: { url: string; method: "GET" | "POST" | "PUT"; body?: string },
    label: string,
  ): Promise<Result<unknown, P1Error>> => {
    let response;
    try {
      response = await options.httpClient.send({
        url: request.url,
        method: request.method,
        headers: headers(request.body !== undefined ? { "Content-Type": FHIR_JSON } : undefined),
        ...(request.body !== undefined ? { body: request.body } : {}),
      });
    } catch (cause) {
      return err(new P1TransportError(`SGO-A ${label} request failed`, { cause }));
    }
    if (response.status >= 400) {
      return err(sgoaHttpError(response.status, response.body));
    }
    return ok(parseJson(response.body));
  };

  return {
    read: (resourceType, id) =>
      send({ url: `${base}/${resourceType}/${id}`, method: "GET" }, `${resourceType} read`),
    create: (resourceType, resource) =>
      send(
        { url: `${base}/${resourceType}`, method: "POST", body: JSON.stringify(resource) },
        `${resourceType} create`,
      ),
    update: (resourceType, id, resource) =>
      send(
        { url: `${base}/${resourceType}/${id}`, method: "PUT", body: JSON.stringify(resource) },
        `${resourceType} update`,
      ),
    search: (resourceType, query) => {
      const qs = serializeQuery(query);
      return send(
        { url: `${base}/${resourceType}${qs ? `?${qs}` : ""}`, method: "GET" },
        `${resourceType} search`,
      );
    },
    get: (pathOrUrl) => {
      const url = /^https?:\/\//.test(pathOrUrl)
        ? pathOrUrl
        : `${base}/${pathOrUrl.replace(/^\//, "")}`;
      return send({ url, method: "GET" }, "GET");
    },
  };
}

/** Serializuje parametry wyszukiwania (tablica = powtórzony parametr). */
export function serializeQuery(query: SgoaQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (typeof value === "string") params.append(key, value);
    else for (const v of value) params.append(key, v);
  }
  return params.toString();
}

/**
 * Mapuje błędną odpowiedź HTTP serwera FHIR na `P1Error`. Kody reguł
 * biznesowych (REG.*) wyciąga z OperationOutcome i tłumaczy wg {@link SGOA_RULE}.
 */
export function sgoaHttpError(status: number, body: string): P1Error {
  const parsed = parseJson(body);
  const issues = outcomeIssues(parsed);
  const ruleCode = issues.map((text) => /REG\.\d+/.exec(text)?.[0]).find(Boolean);
  const ruleHint = ruleCode ? SGOA_RULE[ruleCode as keyof typeof SGOA_RULE] : undefined;
  const detail = issues.join("; ") || `HTTP ${status}`;
  const message = ruleHint ? `${detail} (${ruleHint})` : detail;

  if (status === 400) return new P1ValidationError(message);
  if (status === 401) return new P1AuthenticationError(message);
  if (status === 403) return new P1AuthorizationError(message);
  if (status >= 500) return new P1ServerError(message);
  // 404/405/409/410/412/415/422 - odpowiedzi biznesowe/reguły profilu.
  const outcome: OperationOutcome = {
    major: ruleCode ?? `HTTP ${status}`,
    ...(issues.length > 0 ? { message: detail } : {}),
  };
  return new P1BusinessError(message, { outcome });
}

/** Wyciąga teksty problemów z FHIR OperationOutcome (diagnostics/details). */
function outcomeIssues(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const outcome = body as {
    issue?: { diagnostics?: string; details?: { text?: string; coding?: { code?: string }[] } }[];
  };
  return (outcome.issue ?? [])
    .map((issue) => {
      const code = issue.details?.coding?.map((c) => c.code).find(Boolean);
      const text = issue.diagnostics ?? issue.details?.text;
      return [code, text].filter(Boolean).join(": ");
    })
    .filter((text) => text.length > 0);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/* ------------------------- pomocnicze dla Bundle -------------------------- */

/** Zasoby z Bundle searchset danego typu (pomija OperationOutcome i `_include` innych typów). */
export function bundleResources(bundle: unknown, resourceType: string): unknown[] {
  if (!bundle || typeof bundle !== "object") return [];
  const entries = (bundle as { entry?: { resource?: { resourceType?: unknown } }[] }).entry ?? [];
  return entries
    .map((entry) => entry.resource)
    .filter((resource) => resource?.resourceType === resourceType);
}

/** URL następnej strony wyników (`Bundle.link[relation=next]`). */
export function bundleNextUrl(bundle: unknown): string | undefined {
  if (!bundle || typeof bundle !== "object") return undefined;
  const links = (bundle as { link?: { relation?: string; url?: string }[] }).link ?? [];
  return links.find((link) => link.relation === "next")?.url;
}

/** Łączna liczba trafień (`Bundle.total`), jeśli serwer ją zwrócił. */
export function bundleTotal(bundle: unknown): number | undefined {
  if (!bundle || typeof bundle !== "object") return undefined;
  const total = (bundle as { total?: unknown }).total;
  return typeof total === "number" ? total : undefined;
}
