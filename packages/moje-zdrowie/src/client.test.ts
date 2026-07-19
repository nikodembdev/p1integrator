import { describe, expect, it } from "vitest";
import {
  bundleNextUrl,
  bundleResources,
  bundleTotal,
  serializeQuery,
  sgoaHttpError,
} from "./client.js";
import { OPERATION_OUTCOME_FIXTURE } from "./test-fixtures.js";
import { jsonResponse, recordingHttp, searchsetBundle, testClient } from "./test-helpers.js";

describe("createSgoaClient", () => {
  it("wysyła GET z Bearer i Accept fhir+json, bez nagłówków kontekstu", async () => {
    const http = recordingHttp(jsonResponse({ resourceType: "CarePlan", id: "1" }));
    const result = await testClient(http).read("CarePlan", "1");
    expect(result.ok).toBe(true);

    const request = http.requests[0];
    expect(request?.method).toBe("GET");
    expect(request?.url).toBe("https://isus.example/sgoa/fhir/CarePlan/1");
    expect(request?.headers["Authorization"]).toBe("Bearer TOKEN");
    expect(request?.headers["Accept"]).toBe("application/fhir+json");
    // Kontekst siedzi w tokenie - żadnych nagłówków Kontekst-*/KontekstUzytkownika.
    expect(
      Object.keys(request?.headers ?? {}).find((h) => h.startsWith("Kontekst")),
    ).toBeUndefined();
  });

  it("dodaje Accept-Language, gdy ustawiono język", async () => {
    const http = recordingHttp(jsonResponse({}));
    await testClient(http, "en").read("Questionnaire", "Moje-Zdrowie.2");
    expect(http.requests[0]?.headers["Accept-Language"]).toBe("en");
  });

  it("POST/PUT wysyłają zasób z Content-Type fhir+json", async () => {
    const http = recordingHttp(jsonResponse({}, 201), jsonResponse({}));
    const client = testClient(http);
    await client.create("QuestionnaireResponse", { resourceType: "QuestionnaireResponse" });
    await client.update("CarePlan", "9", { resourceType: "CarePlan", id: "9" });

    expect(http.requests[0]?.method).toBe("POST");
    expect(http.requests[0]?.url).toBe("https://isus.example/sgoa/fhir/QuestionnaireResponse");
    expect(http.requests[0]?.headers["Content-Type"]).toBe("application/fhir+json");
    expect(http.requests[1]?.method).toBe("PUT");
    expect(http.requests[1]?.url).toBe("https://isus.example/sgoa/fhir/CarePlan/9");
    expect(JSON.parse(http.requests[1]?.body ?? "{}")).toMatchObject({ id: "9" });
  });

  it("search serializuje parametry i pomija undefined", async () => {
    const http = recordingHttp(jsonResponse(searchsetBundle([])));
    await testClient(http).search("QuestionnaireResponse", {
      "program-code": "moje_zdrowie",
      created: ["ge2026-01-01", "le2026-12-31"],
      locked: undefined,
    });
    const url = new URL(http.requests[0]?.url ?? "");
    expect(url.searchParams.get("program-code")).toBe("moje_zdrowie");
    expect(url.searchParams.getAll("created")).toEqual(["ge2026-01-01", "le2026-12-31"]);
    expect(url.searchParams.has("locked")).toBe(false);
  });

  it("get przyjmuje ścieżkę względną i pełny URL (paginacja)", async () => {
    const http = recordingHttp(jsonResponse({}), jsonResponse({}));
    const client = testClient(http);
    await client.get("Questionnaire/$eligible?pesel=1");
    await client.get("https://isus.example/sgoa/fhir?_getpages=abc&_getpagesoffset=50");
    expect(http.requests[0]?.url).toBe(
      "https://isus.example/sgoa/fhir/Questionnaire/$eligible?pesel=1",
    );
    expect(http.requests[1]?.url).toBe(
      "https://isus.example/sgoa/fhir?_getpages=abc&_getpagesoffset=50",
    );
  });

  it("mapuje wyjątek transportu na P1TransportError", async () => {
    const client = testClient({
      requests: [],
      httpClient: { send: () => Promise.reject(new Error("ECONNREFUSED")) },
    });
    const result = await client.read("CarePlan", "1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("transport");
  });
});

describe("sgoaHttpError", () => {
  it("422 z regułą REG.* daje P1BusinessError z kodem reguły i podpowiedzią", () => {
    const error = sgoaHttpError(422, JSON.stringify(OPERATION_OUTCOME_FIXTURE));
    expect(error.kind).toBe("business");
    expect(error.message).toContain("REG.16975");
    expect(error.message).toContain("tylko raz");
    // Podpowiedź z SGOA_RULE dokleja się do komunikatu serwera.
    expect(error.message).toContain("może być wypełniona tylko raz");
  });

  it("mapuje statusy HTTP na rodzaje błędów", () => {
    expect(sgoaHttpError(400, "{}").kind).toBe("validation");
    expect(sgoaHttpError(401, "{}").kind).toBe("authentication");
    expect(sgoaHttpError(403, "{}").kind).toBe("authorization");
    expect(sgoaHttpError(404, "{}").kind).toBe("business");
    expect(sgoaHttpError(409, "{}").kind).toBe("business");
    expect(sgoaHttpError(412, "{}").kind).toBe("business");
    expect(sgoaHttpError(500, "{}").kind).toBe("server");
  });

  it("czyta details.coding.code i details.text z OperationOutcome", () => {
    const body = JSON.stringify({
      resourceType: "OperationOutcome",
      issue: [{ details: { coding: [{ code: "REG.16996" }], text: "Brak uprawnień placówki" } }],
    });
    const error = sgoaHttpError(422, body);
    expect(error.message).toContain("REG.16996");
    expect(error.message).toContain("Brak uprawnień placówki");
  });
});

describe("helpery Bundle", () => {
  const bundle = searchsetBundle(
    [
      { resourceType: "QuestionnaireResponse", id: "1" },
      { resourceType: "Questionnaire", id: "def" },
    ],
    { total: 120, nextUrl: "https://isus.example/sgoa/fhir?_getpages=x&_getpagesoffset=50" },
  );

  it("bundleResources filtruje po typie (np. przy _include)", () => {
    expect(bundleResources(bundle, "QuestionnaireResponse")).toHaveLength(1);
    expect(bundleResources(bundle, "Questionnaire")).toHaveLength(1);
    expect(bundleResources(bundle, "CarePlan")).toHaveLength(0);
  });

  it("bundleNextUrl i bundleTotal czytają metadane stronicowania", () => {
    expect(bundleNextUrl(bundle)).toContain("_getpagesoffset=50");
    expect(bundleTotal(bundle)).toBe(120);
    expect(bundleNextUrl(searchsetBundle([]))).toBeUndefined();
  });
});

describe("serializeQuery", () => {
  it("powtarza parametr dla tablicy wartości", () => {
    expect(serializeQuery({ created: ["ge2026-01-01", "le2026-02-01"], _count: "10" })).toBe(
      "created=ge2026-01-01&created=le2026-02-01&_count=10",
    );
  });
});
