import { describe, expect, it } from "vitest";
import {
  findEligibleQuestionnaires,
  getQuestionnaire,
  nextQuestionnairesPage,
  parseSurveyDefinition,
  searchQuestionnaires,
} from "./questionnaire.js";
import { QUESTIONNAIRE_FIXTURE } from "./test-fixtures.js";
import { jsonResponse, recordingHttp, searchsetBundle, testClient } from "./test-helpers.js";

describe("parseSurveyDefinition", () => {
  const definition = parseSurveyDefinition(QUESTIONNAIRE_FIXTURE);

  it("czyta metadane definicji (url, program, płeć, wiek, okres)", () => {
    expect(definition.id).toBe("Moje-Zdrowie.2");
    expect(definition.url).toBe("https://ezdrowie.gov.pl/fhir/Questionnaire/Moje-Zdrowie.2");
    expect(definition.version).toBe("28.3.2");
    expect(definition.title).toBe("Moje Zdrowie");
    expect(definition.programCode).toBe("moje_zdrowie");
    expect(definition.gender).toBe("male");
    expect(definition.ageRange).toEqual({ low: 20, high: 59 });
    expect(definition.effectiveFrom).toBe("2025-05-03");
  });

  it("parsuje drzewo itemów z rozszerzeniami", () => {
    const group = definition.items[0];
    expect(group?.type).toBe("group");
    const wzrost = group?.items?.[0];
    expect(wzrost?.linkId).toBe("wzrost");
    expect(wzrost?.type).toBe("integer");
    expect(wzrost?.required).toBe(true);
    expect(wzrost?.minValue).toBe(50);
    expect(wzrost?.maxValue).toBe(250);

    const bmi = group?.items?.[1];
    expect(bmi?.readOnly).toBe(true);
    expect(bmi?.itemControl).toBe("bmi-scale");
    expect(bmi?.calculatedExpression).toContain("masa-ciala");
    expect(bmi?.fhirPathExpression).toContain("repeat(item)");

    const choice = group?.items?.[2];
    expect(choice?.type).toBe("choice");
    expect(choice?.answerOptions?.map((option) => option.value)).toEqual(["Podstawowe", "Wyższe"]);
    expect(choice?.answerOptions?.[0]?.display).toBe("Podstawowe");
  });

  it("zachowuje surowy zasób (do renderowania formularza)", () => {
    expect(definition.resource).toBe(QUESTIONNAIRE_FIXTURE);
  });
});

describe("findEligibleQuestionnaires", () => {
  it("wywołuje $eligible z PESEL-em i kodem programu (domyślnie moje_zdrowie)", async () => {
    const http = recordingHttp(jsonResponse(searchsetBundle([QUESTIONNAIRE_FIXTURE])));
    const result = await findEligibleQuestionnaires(testClient(http), { pesel: "90080517455" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.id).toBe("Moje-Zdrowie.2");

    const url = new URL(http.requests[0]?.url ?? "");
    expect(url.pathname.endsWith("/Questionnaire/$eligible")).toBe(true);
    expect(url.searchParams.get("pesel")).toBe("90080517455");
    expect(url.searchParams.get("program-code")).toBe("moje_zdrowie");
  });
});

describe("searchQuestionnaires", () => {
  it("serializuje parametry age/gender/program-code", async () => {
    const http = recordingHttp(jsonResponse(searchsetBundle([QUESTIONNAIRE_FIXTURE])));
    await searchQuestionnaires(testClient(http), {
      age: 45,
      gender: "male",
      programCode: "moje_zdrowie",
      count: 10,
    });
    const url = new URL(http.requests[0]?.url ?? "");
    expect(url.searchParams.get("age")).toBe("45");
    expect(url.searchParams.get("gender")).toBe("male");
    expect(url.searchParams.get("program-code")).toBe("moje_zdrowie");
    expect(url.searchParams.get("_count")).toBe("10");
  });

  it("stronicuje przez nextQuestionnairesPage", async () => {
    const nextUrl = "https://isus.example/sgoa/fhir?_getpages=x&_getpagesoffset=50";
    const http = recordingHttp(
      jsonResponse(searchsetBundle([QUESTIONNAIRE_FIXTURE], { nextUrl, total: 51 })),
      jsonResponse(searchsetBundle([QUESTIONNAIRE_FIXTURE])),
    );
    const client = testClient(http);
    const page = await searchQuestionnaires(client, {});
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect(page.value.total).toBe(51);
    expect(page.value.nextUrl).toBe(nextUrl);

    const next = await nextQuestionnairesPage(client, page.value);
    expect(next).toBeDefined();
    expect(http.requests[1]?.url).toBe(nextUrl);

    // Ostatnia strona - brak nextUrl → undefined bez wywołania HTTP.
    if (!next?.ok) return;
    expect(await nextQuestionnairesPage(client, next.value)).toBeUndefined();
  });
});

describe("getQuestionnaire", () => {
  it("czyta definicję po id", async () => {
    const http = recordingHttp(jsonResponse(QUESTIONNAIRE_FIXTURE));
    const result = await getQuestionnaire(testClient(http), "Moje-Zdrowie.2");
    expect(result.ok).toBe(true);
    expect(http.requests[0]?.url).toBe(
      "https://isus.example/sgoa/fhir/Questionnaire/Moje-Zdrowie.2",
    );
  });
});
