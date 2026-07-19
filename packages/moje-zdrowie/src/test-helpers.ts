import type { HttpClient, HttpRequest, HttpResponse } from "@p1/core";
import { createSgoaClient, type SgoaClient } from "./client.js";

/**
 * Helpery do testów jednostkowych: klient HTTP nagrywający żądania
 * i odpowiadający z kolejki (FIFO) oraz fabryka klienta SGO-A na nim.
 */

export interface RecordingHttp {
  readonly httpClient: HttpClient;
  readonly requests: HttpRequest[];
}

/** Klient HTTP zwracający kolejno podane odpowiedzi i zapisujący żądania. */
export function recordingHttp(
  ...responses: readonly (Partial<HttpResponse> & { body: string })[]
): RecordingHttp {
  const queue = [...responses];
  const requests: HttpRequest[] = [];
  return {
    requests,
    httpClient: {
      send: (request) => {
        requests.push(request);
        const next = queue.shift();
        if (!next) return Promise.reject(new Error("Brak przygotowanej odpowiedzi w teście"));
        return Promise.resolve({
          status: next.status ?? 200,
          headers: next.headers ?? {},
          body: next.body,
        });
      },
    },
  };
}

/** Odpowiedź 200 z zasobem FHIR (JSON). */
export function jsonResponse(resource: unknown, status = 200): { status: number; body: string } {
  return { status, body: JSON.stringify(resource) };
}

/** Klient SGO-A na nagrywającym kliencie HTTP. */
export function testClient(http: RecordingHttp, language?: "en" | "uk"): SgoaClient {
  return createSgoaClient({
    baseUrl: "https://isus.example/sgoa/fhir",
    accessToken: "TOKEN",
    httpClient: http.httpClient,
    ...(language ? { language } : {}),
  });
}

/** Bundle searchset z podanymi zasobami. */
export function searchsetBundle(
  resources: readonly unknown[],
  options: { total?: number; nextUrl?: string } = {},
): Record<string, unknown> {
  return {
    resourceType: "Bundle",
    type: "searchset",
    ...(options.total !== undefined ? { total: options.total } : {}),
    ...(options.nextUrl !== undefined
      ? { link: [{ relation: "next", url: options.nextUrl }] }
      : {}),
    entry: resources.map((resource) => ({ resource })),
  };
}
