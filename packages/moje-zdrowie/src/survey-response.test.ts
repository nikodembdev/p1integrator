import { describe, expect, it } from "vitest";
import {
  MOJE_ZDROWIE_PROGRAM_CODE,
  SGOA_EXT,
  SGOA_PESEL_SYSTEM,
  SGOA_PROFILE,
} from "./constants.js";
import {
  buildSurveyResponse,
  cancelSurveyResponse,
  getSurveyResponse,
  parseSurveyResponse,
  restoreSurveyResponse,
  searchSurveyResponses,
  submitSurveyResponse,
  updateSurveyResponse,
} from "./survey-response.js";
import { SURVEY_RESPONSE_FIXTURE } from "./test-fixtures.js";
import { jsonResponse, recordingHttp, searchsetBundle, testClient } from "./test-helpers.js";
import type { SurveyResponseInput } from "./types.js";

const input: SurveyResponseInput = {
  privacyPolicyAcceptanceDate: "2026-07-19T10:00:00+02:00",
  questionnaireUrl: "https://ezdrowie.gov.pl/fhir/Questionnaire/Moje-Zdrowie.2",
  patient: { pesel: "90080517455", givenNames: ["Bartosz", "Jan"], familyName: "Nowak" },
  items: [
    {
      linkId: "dane-podstawowe",
      text: "Dane podstawowe",
      items: [
        { linkId: "wzrost", text: "Wzrost (cm)", answers: [185] },
        { linkId: "masa-ciala", text: "Masa ciała (kg)", answers: [85.2] },
        { linkId: "bmi", text: "BMI", answers: [{ decimal: 25 }] },
        { linkId: "wyksztalcenie", text: "Wykształcenie", answers: ["Wyższe"] },
        { linkId: "palenie", text: "Czy palisz?", answers: [false] },
      ],
    },
  ],
};

describe("buildSurveyResponse", () => {
  const resource = buildSurveyResponse(input);

  it("buduje zasób wg profilu: bez id, z wymaganymi rozszerzeniami i statusem completed", () => {
    expect(resource["resourceType"]).toBe("QuestionnaireResponse");
    expect("id" in resource).toBe(false);
    expect(resource["meta"]).toEqual({ profile: [SGOA_PROFILE.QUESTIONNAIRE_RESPONSE] });
    expect(resource["status"]).toBe("completed");
    expect(resource["questionnaire"]).toBe(input.questionnaireUrl);

    const extensions = resource["extension"] as { url: string }[];
    expect(extensions.map((ext) => ext.url)).toEqual([
      SGOA_EXT.PROGRAM_CODE,
      SGOA_EXT.PRIVACY_POLICY_ACCEPTANCE_DATE,
    ]);
    expect(extensions[0]).toMatchObject({ valueCode: MOJE_ZDROWIE_PROGRAM_CODE });
    expect(extensions[1]).toMatchObject({ valueDateTime: input.privacyPolicyAcceptanceDate });
  });

  it("wpisuje PESEL i dane pacjenta w subject (_display z rozszerzeniami)", () => {
    const subject = resource["subject"] as Record<string, unknown>;
    expect(subject["identifier"]).toEqual({ system: SGOA_PESEL_SYSTEM, value: "90080517455" });
    const display = (subject["_display"] as { extension: { url: string; valueString: string }[] })
      .extension;
    expect(display[0]).toEqual({ url: SGOA_EXT.DISPLAY_FAMILY_NAME, valueString: "Nowak" });
    expect(display.slice(1).map((ext) => ext.valueString)).toEqual(["Bartosz", "Jan"]);
  });

  it("mapuje odpowiedzi na właściwe value[x] (integer/decimal/string/boolean + wymuszenie)", () => {
    const group = (resource["item"] as Record<string, unknown>[])[0];
    const answers = (group?.["item"] as { answer?: Record<string, unknown>[] }[]).map(
      (item) => item.answer?.[0],
    );
    expect(answers[0]).toEqual({ valueInteger: 185 });
    expect(answers[1]).toEqual({ valueDecimal: 85.2 });
    // Jawne wymuszenie decimal dla wartości całkowitej (np. wyliczone BMI = 25).
    expect(answers[2]).toEqual({ valueDecimal: 25 });
    expect(answers[3]).toEqual({ valueString: "Wyższe" });
    expect(answers[4]).toEqual({ valueBoolean: false });
  });

  it("pomija pusty answer dla grup", () => {
    const group = (resource["item"] as Record<string, unknown>[])[0];
    expect(group && "answer" in group).toBe(false);
  });
});

describe("parseSurveyResponse", () => {
  const survey = parseSurveyResponse(SURVEY_RESPONSE_FIXTURE);

  it("czyta pola domenowe (id, status, program, pacjent, powiązany zakres badań)", () => {
    expect(survey.id).toBe("12345");
    expect(survey.status).toBe("completed");
    expect(survey.programCode).toBe("moje_zdrowie");
    expect(survey.patientPesel).toBe("90080517455");
    expect(survey.examPlanId).toBe("98765");
    expect(survey.surveyStatus).toBe("wypelniona");
    expect(survey.locked).toBe(false);
    expect(survey.archivalVersion).toBe(false);
  });

  it("czyta historię modyfikacji z lokalizacją", () => {
    expect(survey.modificationHistory).toHaveLength(1);
    expect(survey.modificationHistory[0]).toMatchObject({
      channel: "podmiot_zew",
      type: "utworzenie",
      version: "1",
      locationId: { system: "urn:oid:2.16.840.1.113883.3.4424.2.3.3", value: "00000001211-1" },
    });
  });

  it("parsuje odpowiedzi (drzewo item/answer)", () => {
    const group = survey.items[0];
    expect(group?.linkId).toBe("dane-podstawowe");
    expect(group?.items[0]?.answers).toEqual([185]);
    expect(group?.items[1]?.answers).toEqual([85.2]);
    expect(group?.items[2]?.answers).toEqual(["Wyższe"]);
  });
});

describe("submitSurveyResponse", () => {
  it("POST-uje zbudowany zasób i zwraca sparsowaną odpowiedź z examPlanId", async () => {
    const http = recordingHttp(jsonResponse(SURVEY_RESPONSE_FIXTURE, 201));
    const result = await submitSurveyResponse(testClient(http), input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("12345");
    expect(result.value.examPlanId).toBe("98765");

    expect(http.requests[0]?.method).toBe("POST");
    const sent = JSON.parse(http.requests[0]?.body ?? "{}") as Record<string, unknown>;
    expect(sent["status"]).toBe("completed");
    expect("id" in sent).toBe(false);
  });
});

describe("updateSurveyResponse", () => {
  it("PUT-uje pełny zasób z podmienionymi odpowiedziami i datą akceptacji", async () => {
    const updated = { ...SURVEY_RESPONSE_FIXTURE };
    const http = recordingHttp(jsonResponse(SURVEY_RESPONSE_FIXTURE), jsonResponse(updated));
    const result = await updateSurveyResponse(testClient(http), "12345", {
      items: [{ linkId: "wzrost", text: "Wzrost (cm)", answers: [180] }],
      privacyPolicyAcceptanceDate: "2026-07-19T11:00:00+02:00",
    });
    expect(result.ok).toBe(true);

    expect(http.requests[0]?.method).toBe("GET");
    expect(http.requests[1]?.method).toBe("PUT");
    expect(http.requests[1]?.url).toContain("/QuestionnaireResponse/12345");
    const sent = JSON.parse(http.requests[1]?.body ?? "{}") as {
      id: string;
      item: unknown[];
      extension: { url: string; valueDateTime?: string }[];
    };
    // PUT wymaga id zgodnego z URL; item podmienione w całości.
    expect(sent.id).toBe("12345");
    expect(sent.item).toEqual([
      { linkId: "wzrost", text: "Wzrost (cm)", answer: [{ valueInteger: 180 }] },
    ]);
    const acceptance = sent.extension.find(
      (ext) => ext.url === SGOA_EXT.PRIVACY_POLICY_ACCEPTANCE_DATE,
    );
    expect(acceptance?.valueDateTime).toBe("2026-07-19T11:00:00+02:00");
  });

  it("odmawia edycji ankiety zablokowanej (surveyLock) bez wywołania serwera", async () => {
    const locked = {
      ...SURVEY_RESPONSE_FIXTURE,
      extension: [
        ...SURVEY_RESPONSE_FIXTURE.extension,
        { url: SGOA_EXT.SURVEY_LOCK, valueBoolean: true },
      ],
    };
    const http = recordingHttp(jsonResponse(locked));
    const result = await updateSurveyResponse(testClient(http), "12345", { items: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("validation");
    expect(result.error.message).toContain("REG.16978");
    expect(http.requests).toHaveLength(1); // tylko GET, bez PUT
  });
});

describe("cancelSurveyResponse / restoreSurveyResponse", () => {
  it("anulowanie: status entered-in-error + powód w rozszerzeniu", async () => {
    const http = recordingHttp(
      jsonResponse(SURVEY_RESPONSE_FIXTURE),
      jsonResponse({ ...SURVEY_RESPONSE_FIXTURE, status: "entered-in-error" }),
    );
    const result = await cancelSurveyResponse(testClient(http), "12345", "Pomyłka pacjenta");
    expect(result.ok).toBe(true);

    const sent = JSON.parse(http.requests[1]?.body ?? "{}") as {
      status: string;
      extension: { url: string; valueString?: string }[];
    };
    expect(sent.status).toBe("entered-in-error");
    expect(sent.extension.at(-1)).toEqual({
      url: SGOA_EXT.CANCEL_REASON,
      valueString: "Pomyłka pacjenta",
    });
  });

  it("wycofanie anulowania: status completed i usunięty powód", async () => {
    const cancelled = {
      ...SURVEY_RESPONSE_FIXTURE,
      status: "entered-in-error",
      extension: [
        ...SURVEY_RESPONSE_FIXTURE.extension,
        { url: SGOA_EXT.CANCEL_REASON, valueString: "Pomyłka" },
      ],
    };
    const http = recordingHttp(jsonResponse(cancelled), jsonResponse(SURVEY_RESPONSE_FIXTURE));
    const result = await restoreSurveyResponse(testClient(http), "12345");
    expect(result.ok).toBe(true);

    const sent = JSON.parse(http.requests[1]?.body ?? "{}") as {
      status: string;
      extension: { url: string }[];
    };
    expect(sent.status).toBe("completed");
    expect(sent.extension.some((ext) => ext.url === SGOA_EXT.CANCEL_REASON)).toBe(false);
  });

  it("wycofanie anulowania wymaga ankiety anulowanej", async () => {
    const http = recordingHttp(jsonResponse(SURVEY_RESPONSE_FIXTURE));
    const result = await restoreSurveyResponse(testClient(http), "12345");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("validation");
  });
});

describe("searchSurveyResponses", () => {
  it("serializuje wszystkie parametry SGO-A (w tym _include)", async () => {
    const http = recordingHttp(jsonResponse(searchsetBundle([SURVEY_RESPONSE_FIXTURE])));
    await searchSurveyResponses(testClient(http), {
      ids: ["1", "2"],
      programCode: "moje_zdrowie",
      patientPesel: "90080517455",
      pozLocationId: "000000927722-001",
      pozPractitionerId: "4727124",
      locked: false,
      surveyStatus: "wypelniona",
      created: ["ge2026-01-01"],
      include: ["exam-plan", "questionnaire"],
      sort: "-_lastUpdated",
      count: 20,
      accurateTotal: true,
    });
    const url = new URL(http.requests[0]?.url ?? "");
    expect(url.searchParams.get("_id")).toBe("1,2");
    expect(url.searchParams.get("subject-identifier")).toBe(`${SGOA_PESEL_SYSTEM}|90080517455`);
    expect(url.searchParams.get("subject-poz")).toBe("000000927722-001");
    expect(url.searchParams.get("subject-poz-doctor")).toBe("4727124");
    expect(url.searchParams.get("locked")).toBe("false");
    expect(url.searchParams.get("survey-status")).toBe("wypelniona");
    expect(url.searchParams.get("created")).toBe("ge2026-01-01");
    expect(url.searchParams.getAll("_include")).toEqual([
      "QuestionnaireResponse:based-on",
      "QuestionnaireResponse:questionnaire",
    ]);
    expect(url.searchParams.get("_sort")).toBe("-_lastUpdated");
    expect(url.searchParams.get("_count")).toBe("20");
    expect(url.searchParams.get("_total")).toBe("accurate");
  });
});

describe("getSurveyResponse", () => {
  it("czyta ankietę po id", async () => {
    const http = recordingHttp(jsonResponse(SURVEY_RESPONSE_FIXTURE));
    const result = await getSurveyResponse(testClient(http), "12345");
    expect(result.ok).toBe(true);
    expect(http.requests[0]?.url).toContain("/QuestionnaireResponse/12345");
  });
});
