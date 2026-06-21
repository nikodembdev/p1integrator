import {
  err,
  type HttpClient,
  ok,
  type OperationOutcome,
  type P1Error,
  P1BusinessError,
  P1TransportError,
  type Result,
} from "@p1/core";

/** Klient REST serwera FHIR ZM (Bearer + mTLS). */
export interface FhirClient {
  /** POST zasobu FHIR (JSON) pod /fhir/{resourceType}. */
  create(resourceType: string, resource: unknown): Promise<Result<FhirCreated, P1Error>>;
  /** GET /fhir/{resourceType}?{query} - zwraca id pasujących zasobów (z Bundle). */
  search(
    resourceType: string,
    query: Readonly<Record<string, string>>,
  ): Promise<Result<FhirSearch, P1Error>>;
  /** GET /fhir/{resourceType}/{id} jako XML - surowe oktety + wersja (do podpisu). */
  readXml(resourceType: string, id: string): Promise<Result<FhirResourceXml, P1Error>>;
}

export interface FhirResourceXml {
  /** Surowe oktety zasobu (application/fhir+xml) - podstawa do liczenia digestu. */
  readonly xml: string;
  /** Wersja zasobu (meta.versionId). */
  readonly versionId: string;
}

export interface FhirSearch {
  /** Id zasobów z Bundle (puste, gdy brak trafień). */
  readonly ids: readonly string[];
  /** Surowy Bundle. */
  readonly bundle: unknown;
}

export interface FhirCreated {
  /** Id nadane przez serwer (z nagłówka Location lub odpowiedzi). */
  readonly id?: string;
  /** Nagłówek Location (pełny URL utworzonego zasobu). */
  readonly location?: string;
  /** Zwrócony zasób / OperationOutcome. */
  readonly body: unknown;
}

export interface FhirClientOptions {
  /** Bazowy adres serwera FHIR, np. https://isus.ezdrowie.gov.pl/fhir. */
  readonly baseUrl: string;
  /** Token dostępu (Bearer) z OAuth2. */
  readonly accessToken: string;
  /** Klient HTTP z mTLS. */
  readonly httpClient: HttpClient;
}

const FHIR_JSON = "application/fhir+json";

export function createFhirClient(options: FhirClientOptions): FhirClient {
  const base = options.baseUrl.replace(/\/$/, "");
  return {
    async create(resourceType, resource) {
      let response;
      try {
        response = await options.httpClient.send({
          url: `${base}/${resourceType}`,
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.accessToken}`,
            "Content-Type": FHIR_JSON,
            Accept: FHIR_JSON,
          },
          body: JSON.stringify(resource),
        });
      } catch (cause) {
        return err(new P1TransportError(`FHIR ${resourceType} request failed`, { cause }));
      }

      const body: unknown = parseJson(response.body);
      if (response.status >= 400) {
        return err(new P1BusinessError(operationOutcomeMessage(body, response.status)));
      }
      const location = response.headers["location"] ?? response.headers["Location"];
      const id = extractId(body);
      return ok({
        body,
        ...(location ? { location } : {}),
        ...(id ? { id } : {}),
      });
    },

    async search(resourceType, query) {
      const qs = new URLSearchParams(query).toString();
      let response;
      try {
        response = await options.httpClient.send({
          url: `${base}/${resourceType}?${qs}`,
          method: "GET",
          headers: { Authorization: `Bearer ${options.accessToken}`, Accept: FHIR_JSON },
        });
      } catch (cause) {
        return err(new P1TransportError(`FHIR ${resourceType} search failed`, { cause }));
      }
      const bundle: unknown = parseJson(response.body);
      if (response.status >= 400) {
        return err(new P1BusinessError(operationOutcomeMessage(bundle, response.status)));
      }
      return ok({ ids: bundleResourceIds(bundle), bundle });
    },

    async readXml(resourceType, id) {
      let response;
      try {
        response = await options.httpClient.send({
          url: `${base}/${resourceType}/${id}`,
          method: "GET",
          headers: {
            Authorization: `Bearer ${options.accessToken}`,
            Accept: "application/fhir+xml",
          },
        });
      } catch (cause) {
        return err(new P1TransportError(`FHIR ${resourceType} read failed`, { cause }));
      }
      if (response.status >= 400) {
        return err(new P1BusinessError(`FHIR ${resourceType}/${id} read: HTTP ${response.status}`));
      }
      const versionId = /<versionId value="([^"]+)"/.exec(response.body)?.[1] ?? "1";
      return ok({ xml: response.body, versionId });
    },
  };
}

function bundleResourceIds(bundle: unknown): string[] {
  if (!bundle || typeof bundle !== "object") return [];
  const entries = (bundle as { entry?: { resource?: { id?: unknown } }[] }).entry ?? [];
  return entries.map((e) => e.resource?.id).filter((id): id is string => typeof id === "string");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractId(body: unknown): string | undefined {
  if (body && typeof body === "object" && "id" in body) {
    const id = (body as Record<string, unknown>)["id"];
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

/** Wyciąga czytelny komunikat z FHIR OperationOutcome (issue[].diagnostics). */
function operationOutcomeMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const outcome = body as { issue?: { diagnostics?: string; details?: { text?: string } }[] };
    const diagnostics = outcome.issue
      ?.map((i) => i.diagnostics ?? i.details?.text)
      .filter(Boolean)
      .join("; ");
    if (diagnostics) return diagnostics;
  }
  return `FHIR HTTP ${status}`;
}

/** Re-eksport dla wygody konsumenta. */
export type { OperationOutcome };
