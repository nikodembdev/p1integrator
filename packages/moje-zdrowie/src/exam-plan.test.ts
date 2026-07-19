import { describe, expect, it } from "vitest";
import {
  acceptExamPlan,
  backToHoldExamPlan,
  completeExamPlan,
  getExamPlan,
  holdExamPlan,
  parseExamPlan,
  reopenExamPlan,
  searchExamPlans,
  withdrawExamPlan,
} from "./exam-plan.js";
import { EXAM_PLAN_FIXTURE } from "./test-fixtures.js";
import { jsonResponse, recordingHttp, searchsetBundle, testClient } from "./test-helpers.js";

const asDraft = { ...EXAM_PLAN_FIXTURE, status: "draft", period: undefined };
const asCompleted = { ...EXAM_PLAN_FIXTURE, status: "completed" };

describe("parseExamPlan", () => {
  const plan = parseExamPlan(EXAM_PLAN_FIXTURE);

  it("czyta pola domenowe zakresu badań", () => {
    expect(plan.id).toBe("98765");
    expect(plan.status).toBe("active");
    expect(plan.programCode).toBe("moje_zdrowie");
    expect(plan.patientPesel).toBe("90080517455");
    expect(plan.startDate).toBe("2025-03-12");
    expect(plan.note).toBe("Id zlecenia: 1234");
    expect(plan.archivalVersion).toBe(false);
  });

  it("parsuje badania (kod ze słownika, rodzaj, status)", () => {
    expect(plan.activities).toHaveLength(2);
    expect(plan.activities[0]).toMatchObject({
      code: "C55",
      display: "[C55] Morfologia krwi, z pełnym różnicowaniem granulocytów",
      procedureType: "podstawowe",
      status: "scheduled",
    });
    // Rodzaj badania jest opcjonalny w danych z serwera.
    expect(plan.activities[1]?.code).toBe("L43");
    expect(plan.activities[1]?.procedureType).toBeUndefined();
  });

  it("czyta historię modyfikacji", () => {
    expect(plan.modificationHistory.map((entry) => entry.type)).toEqual([
      "utworzenie",
      "podjecie_realizacji",
    ]);
  });
});

describe("przejścia statusów", () => {
  it("acceptExamPlan: draft→active z datą podjęcia i notatką", async () => {
    const http = recordingHttp(jsonResponse(asDraft), jsonResponse(EXAM_PLAN_FIXTURE));
    const result = await acceptExamPlan(testClient(http), "98765", {
      startDate: "2026-07-19",
      note: "Zlecenie 555",
    });
    expect(result.ok).toBe(true);

    expect(http.requests[0]?.method).toBe("GET");
    expect(http.requests[1]?.method).toBe("PUT");
    const sent = JSON.parse(http.requests[1]?.body ?? "{}") as Record<string, unknown>;
    expect(sent["status"]).toBe("active");
    expect(sent["period"]).toEqual({ start: "2026-07-19" });
    expect(sent["note"]).toEqual([{ text: "Zlecenie 555" }]);
  });

  it("acceptExamPlan odrzuca zakres w statusie active (dozwolony tylko draft)", async () => {
    const http = recordingHttp(jsonResponse(EXAM_PLAN_FIXTURE));
    const result = await acceptExamPlan(testClient(http), "98765", { startDate: "2026-07-19" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("validation");
    expect(http.requests).toHaveLength(1); // bez PUT
  });

  it("holdExamPlan: active→on-hold", async () => {
    const http = recordingHttp(
      jsonResponse(EXAM_PLAN_FIXTURE),
      jsonResponse({ ...EXAM_PLAN_FIXTURE, status: "on-hold" }),
    );
    const result = await holdExamPlan(testClient(http), "98765");
    expect(result.ok).toBe(true);
    const sent = JSON.parse(http.requests[1]?.body ?? "{}") as Record<string, unknown>;
    expect(sent["status"]).toBe("on-hold");
  });

  it("completeExamPlan: dozwolone z active i on-hold", async () => {
    const http = recordingHttp(
      jsonResponse({ ...EXAM_PLAN_FIXTURE, status: "on-hold" }),
      jsonResponse(asCompleted),
    );
    const result = await completeExamPlan(testClient(http), "98765");
    expect(result.ok).toBe(true);
  });

  it("reopenExamPlan: completed→active; backToHoldExamPlan: completed→on-hold", async () => {
    const http = recordingHttp(
      jsonResponse(asCompleted),
      jsonResponse(EXAM_PLAN_FIXTURE),
      jsonResponse(asCompleted),
      jsonResponse({ ...EXAM_PLAN_FIXTURE, status: "on-hold" }),
    );
    const client = testClient(http);
    expect((await reopenExamPlan(client, "98765")).ok).toBe(true);
    expect((await backToHoldExamPlan(client, "98765")).ok).toBe(true);
  });

  it("withdrawExamPlan: →draft z usuniętym period (wymóg P1)", async () => {
    const http = recordingHttp(jsonResponse(EXAM_PLAN_FIXTURE), jsonResponse(asDraft));
    const result = await withdrawExamPlan(testClient(http), "98765");
    expect(result.ok).toBe(true);
    const sent = JSON.parse(http.requests[1]?.body ?? "{}") as Record<string, unknown>;
    expect(sent["status"]).toBe("draft");
    expect("period" in sent).toBe(false);
    // Notatka zostaje, chyba że clearNote.
    expect(sent["note"]).toEqual([{ text: "Id zlecenia: 1234" }]);
  });

  it("withdrawExamPlan z clearNote usuwa notatkę", async () => {
    const http = recordingHttp(jsonResponse(EXAM_PLAN_FIXTURE), jsonResponse(asDraft));
    await withdrawExamPlan(testClient(http), "98765", { clearNote: true });
    const sent = JSON.parse(http.requests[1]?.body ?? "{}") as Record<string, unknown>;
    expect("note" in sent).toBe(false);
  });

  it("przyjmuje wcześniej pobrany ExamPlan bez ponownego GET", async () => {
    const http = recordingHttp(jsonResponse({ ...EXAM_PLAN_FIXTURE, status: "on-hold" }));
    const plan = parseExamPlan(asCompleted);
    const result = await backToHoldExamPlan(testClient(http), plan);
    expect(result.ok).toBe(true);
    expect(http.requests).toHaveLength(1); // od razu PUT
    expect(http.requests[0]?.method).toBe("PUT");
  });
});

describe("searchExamPlans", () => {
  it("serializuje parametry wyszukiwania zakresów badań", async () => {
    const http = recordingHttp(jsonResponse(searchsetBundle([EXAM_PLAN_FIXTURE])));
    await searchExamPlans(testClient(http), {
      patientPesel: "90080517455",
      pozLocationId: "000000927722-001",
      periodStart: "ge2026-01-01",
      created: ["ge2025-01-01", "le2026-12-31"],
    });
    const url = new URL(http.requests[0]?.url ?? "");
    expect(url.pathname.endsWith("/CarePlan")).toBe(true);
    expect(url.searchParams.get("subject-identifier")).toContain("90080517455");
    expect(url.searchParams.get("period-start")).toBe("ge2026-01-01");
    expect(url.searchParams.getAll("created")).toHaveLength(2);
  });
});

describe("getExamPlan", () => {
  it("czyta zakres badań po id", async () => {
    const http = recordingHttp(jsonResponse(EXAM_PLAN_FIXTURE));
    const result = await getExamPlan(testClient(http), "98765");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("98765");
  });
});
