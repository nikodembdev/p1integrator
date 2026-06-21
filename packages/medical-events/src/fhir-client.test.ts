import type { HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import { createFhirClient } from "./fhir-client.js";

const clientWith = (
  responder: (r: HttpRequest) => { status: number; headers?: Record<string, string>; body: string },
  capture?: (r: HttpRequest) => void,
): HttpClient => ({
  send: (request) => {
    capture?.(request);
    const r = responder(request);
    return Promise.resolve({ status: r.status, headers: r.headers ?? {}, body: r.body });
  },
});

const opts = (httpClient: HttpClient) => ({
  baseUrl: "https://p1.example/fhir",
  accessToken: "TOK",
  httpClient,
});

describe("createFhirClient.create", () => {
  it("POST-uje zasób z Bearer i zwraca id/location", async () => {
    let captured: HttpRequest | undefined;
    const fhir = createFhirClient(
      opts(
        clientWith(
          () => ({
            status: 201,
            headers: { Location: "https://p1.example/fhir/Encounter/999/_history/1" },
            body: JSON.stringify({ resourceType: "Encounter", id: "999" }),
          }),
          (r) => (captured = r),
        ),
      ),
    );

    const result = await fhir.create("Encounter", { resourceType: "Encounter" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe("999");
      expect(result.value.location).toContain("/Encounter/999");
    }
    expect(captured?.method).toBe("POST");
    expect(captured?.url).toBe("https://p1.example/fhir/Encounter");
    expect(captured?.headers.Authorization).toBe("Bearer TOK");
    expect(captured?.headers["Content-Type"]).toBe("application/fhir+json");
  });

  it("mapuje OperationOutcome (4xx) na błąd biznesowy z diagnostics", async () => {
    const fhir = createFhirClient(
      opts(
        clientWith(() => ({
          status: 422,
          body: JSON.stringify({
            resourceType: "OperationOutcome",
            issue: [{ severity: "error", diagnostics: "REG.WER.4059 Niezgodność danych" }],
          }),
        })),
      ),
    );
    const result = await fhir.create("Encounter", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("business");
      expect(result.error.message).toContain("REG.WER.4059");
    }
  });
});

describe("createFhirClient.search", () => {
  it("buduje query i wyciąga id z Bundle", async () => {
    let captured: HttpRequest | undefined;
    const fhir = createFhirClient(
      opts(
        clientWith(
          () => ({
            status: 200,
            body: JSON.stringify({
              resourceType: "Bundle",
              entry: [{ resource: { resourceType: "Patient", id: "540" } }],
            }),
          }),
          (r) => (captured = r),
        ),
      ),
    );

    const result = await fhir.search("Patient", {
      plpatient: "urn:oid:x|40010151673",
      plgiven: "Sylwester",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ids).toEqual(["540"]);
    expect(captured?.method).toBe("GET");
    expect(captured?.url).toContain("/fhir/Patient?");
    expect(captured?.url).toContain("plpatient=urn%3Aoid%3Ax%7C40010151673");
    expect(captured?.url).toContain("plgiven=Sylwester");
  });

  it("zwraca pustą listę przy braku trafień", async () => {
    const fhir = createFhirClient(
      opts(clientWith(() => ({ status: 200, body: JSON.stringify({ resourceType: "Bundle" }) }))),
    );
    const result = await fhir.search("Patient", { plpatient: "x|y" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ids).toEqual([]);
  });
});
