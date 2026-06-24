import type { HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import { fetchPatientSummary } from "./client.js";
import { PESEL_OID } from "./constants.js";
import type { PatientSummaryContext, PatientSummaryTransport } from "./types.js";

const context: PatientSummaryContext = {
  patient: { root: PESEL_OID, extension: "14300530581" },
  subject: { root: "2.16.840.1.113883.3.4424.2.3.1", extension: "000000001688" },
  workplace: { root: "2.16.840.1.113883.3.4424.2.3.3", extension: "000000001688-001" },
  user: { root: "2.16.840.1.113883.3.4424.1.6.2", extension: "5223344" },
  userRole: "LEK",
  accessMode: "BTG",
};

const transportWith = (httpClient: HttpClient): PatientSummaryTransport => ({
  httpClient,
  baseUrl: "https://tsus.ezdrowie.gov.pl/",
  accessToken: "ACCESS-TOKEN",
  clock: { now: () => new Date("2026-01-01T00:00:00Z") },
  correlationId: "00000000-0000-4000-8000-000000000000",
});

describe("fetchPatientSummary", () => {
  it("buduje żądanie GET z nagłówkami kontekstu i dekoduje base64 CDA", async () => {
    const cda = "<ClinicalDocument/>";
    const responseBody = JSON.stringify({
      idDokumentu: "2d4fb30a-3f79-4a1f-894b-36c4406ba4d5",
      dokument: Buffer.from(cda, "utf8").toString("base64"),
      dataWygenerowania: "2026-05-23T12:34:56Z",
    });
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (request) => {
        captured = request;
        return Promise.resolve({ status: 200, headers: {}, body: responseBody });
      },
    };

    const result = await fetchPatientSummary("HL7_CDA", context, transportWith(client));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cdaXml).toBe(cda);
    expect(result.value.documentId).toBe("2d4fb30a-3f79-4a1f-894b-36c4406ba4d5");
    expect(result.value.generatedAt).toBe("2026-05-23T12:34:56Z");

    expect(captured?.method).toBe("GET");
    expect(captured?.url).toBe("https://tsus.ezdrowie.gov.pl/patient-summary/HL7_CDA");
    const h = captured?.headers ?? {};
    expect(h["Authorization"]).toBe("Bearer ACCESS-TOKEN");
    expect(h["Identyfikator-Pacjenta"]).toBe(`${PESEL_OID}:14300530581`);
    expect(h["Kontekst-idPodmiotu"]).toBe("2.16.840.1.113883.3.4424.2.3.1:000000001688");
    expect(h["Kontekst-trybDostepuDoDanych"]).toBe("BTG");
    expect(h["Kontekst-uuidZdarzeniaInicjujacego"]).toBe("00000000-0000-4000-8000-000000000000");

    // KontekstUzytkownika - base64(JSON) z kluczowymi polami.
    const ctx = JSON.parse(
      Buffer.from(h["KontekstUzytkownika"] ?? "", "base64").toString("utf8"),
    ) as Record<string, unknown>;
    expect(ctx["sub"]).toBe("2.16.840.1.113883.3.4424.2.3.1:000000001688");
    expect(ctx["user_id"]).toBe("2.16.840.1.113883.3.4424.1.6.2:5223344");
    expect(ctx["purpose"]).toBe("BTG");
  });

  it("zwraca PDF jako bajty bez dekodowania na tekst CDA", async () => {
    const pdfBytes = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
    const client: HttpClient = {
      send: () =>
        Promise.resolve({
          status: 200,
          headers: {},
          body: JSON.stringify({ dokument: pdfBytes.toString("base64") }),
        }),
    };
    const result = await fetchPatientSummary("PDF", context, transportWith(client));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cdaXml).toBeUndefined();
    expect(result.value.content.equals(pdfBytes)).toBe(true);
  });

  it("mapuje 404 z treścią Wynik na błąd biznesowy", async () => {
    const client: HttpClient = {
      send: () =>
        Promise.resolve({
          status: 404,
          headers: {},
          body: JSON.stringify({
            komunikat: "Brak danych.",
            major: "BrakDanych",
            minor: "BladOdczytu",
          }),
        }),
    };
    const result = await fetchPatientSummary("HL7_CDA", context, transportWith(client));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("business");
    expect(result.error.message).toBe("Brak danych.");
  });

  it("mapuje 403 na błąd autoryzacji", async () => {
    const client: HttpClient = {
      send: () =>
        Promise.resolve({
          status: 403,
          headers: {},
          body: JSON.stringify({ komunikat: "Brak uprawnień", major: "BrakDostepu" }),
        }),
    };
    const result = await fetchPatientSummary("PDF", context, transportWith(client));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("authorization");
  });
});
