import { err, map, ok, type P1Error, P1ValidationError, type Result } from "@p1/core";
import {
  bundleNextUrl,
  bundleResources,
  bundleTotal,
  type SgoaClient,
  type SgoaQuery,
} from "./client.js";
import {
  MOJE_ZDROWIE_PROGRAM_CODE,
  SGOA_EXT,
  SGOA_PESEL_SYSTEM,
  SGOA_PROFILE,
} from "./constants.js";
import {
  asArray,
  asBoolean,
  asObject,
  asString,
  extensionValue,
  modificationHistory,
  subjectPesel,
  type FhirObject,
} from "./fhir.js";
import type {
  SearchPage,
  SurveyAnswerValue,
  SurveyResponse,
  SurveyResponseInput,
  SurveyResponseItem,
  SurveyResponseItemInput,
  SurveyResponseSearchParams,
} from "./types.js";

/**
 * Ankiety pacjenta (QuestionnaireResponse, profil PLSGOAQuestionnaireResponse).
 * Zapis generuje po stronie P1 zakres badań (CarePlan) - jego id wraca
 * w `basedOn` i jest dostępne jako `examPlanId`.
 */

/** Buduje zasób QuestionnaireResponse do zapisu (bez `id` - nadaje go serwer). */
export function buildSurveyResponse(input: SurveyResponseInput): Record<string, unknown> {
  return {
    resourceType: "QuestionnaireResponse",
    meta: { profile: [SGOA_PROFILE.QUESTIONNAIRE_RESPONSE] },
    extension: [
      {
        url: SGOA_EXT.PROGRAM_CODE,
        valueCode: input.programCode ?? MOJE_ZDROWIE_PROGRAM_CODE,
      },
      {
        url: SGOA_EXT.PRIVACY_POLICY_ACCEPTANCE_DATE,
        valueDateTime: input.privacyPolicyAcceptanceDate,
      },
    ],
    questionnaire: input.questionnaireUrl,
    status: "completed",
    subject: {
      identifier: { system: SGOA_PESEL_SYSTEM, value: input.patient.pesel },
      _display: {
        extension: [
          { url: SGOA_EXT.DISPLAY_FAMILY_NAME, valueString: input.patient.familyName },
          ...input.patient.givenNames.map((givenName) => ({
            url: SGOA_EXT.DISPLAY_GIVEN_NAME,
            valueString: givenName,
          })),
        ],
      },
    },
    item: input.items.map(itemToFhir),
  };
}

function itemToFhir(item: SurveyResponseItemInput): Record<string, unknown> {
  return {
    linkId: item.linkId,
    text: item.text,
    ...(item.answers !== undefined && item.answers.length > 0
      ? { answer: item.answers.map(answerToFhir) }
      : {}),
    ...(item.items !== undefined && item.items.length > 0
      ? { item: item.items.map(itemToFhir) }
      : {}),
  };
}

/** Mapuje wartość odpowiedzi na FHIR `answer.value[x]`. */
function answerToFhir(value: SurveyAnswerValue): Record<string, unknown> {
  if (typeof value === "boolean") return { valueBoolean: value };
  if (typeof value === "string") return { valueString: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { valueInteger: value } : { valueDecimal: value };
  }
  if ("decimal" in value) return { valueDecimal: value.decimal };
  return { valueInteger: value.integer };
}

/** Zapisuje wypełnioną ankietę pacjenta (`POST /QuestionnaireResponse`). */
export async function submitSurveyResponse(
  client: SgoaClient,
  input: SurveyResponseInput,
): Promise<Result<SurveyResponse, P1Error>> {
  const result = await client.create("QuestionnaireResponse", buildSurveyResponse(input));
  return map(result, parseSurveyResponse);
}

/** Odczytuje ankietę pacjenta po identyfikatorze. */
export async function getSurveyResponse(
  client: SgoaClient,
  id: string,
): Promise<Result<SurveyResponse, P1Error>> {
  const result = await client.read("QuestionnaireResponse", id);
  return map(result, parseSurveyResponse);
}

/**
 * Aktualizuje ankietę (`PUT` pełnego zasobu): można zmienić odpowiedzi i datę
 * akceptacji polityki prywatności. Ankieta z podjętą realizacją (`locked`)
 * lub archiwalna jest nieedytowalna - zwracamy błąd bez wywołania serwera.
 */
export async function updateSurveyResponse(
  client: SgoaClient,
  current: SurveyResponse | string,
  changes: {
    readonly items?: readonly SurveyResponseItemInput[];
    readonly privacyPolicyAcceptanceDate?: string;
  },
): Promise<Result<SurveyResponse, P1Error>> {
  const loaded = await load(client, current);
  if (!loaded.ok) return loaded;
  const survey = loaded.value;
  const guard = editableGuard(survey);
  if (guard) return err(guard);

  const resource = { ...(asObject(survey.resource) ?? {}) };
  if (changes.items !== undefined) {
    resource["item"] = changes.items.map(itemToFhir);
  }
  if (changes.privacyPolicyAcceptanceDate !== undefined) {
    resource["extension"] = replaceExtensionValue(
      asArray(resource["extension"]),
      SGOA_EXT.PRIVACY_POLICY_ACCEPTANCE_DATE,
      { valueDateTime: changes.privacyPolicyAcceptanceDate },
    );
  }
  const result = await client.update("QuestionnaireResponse", requireId(survey), resource);
  return map(result, parseSurveyResponse);
}

/**
 * Anuluje ankietę: `PUT` ze `status=entered-in-error` i opcjonalnym powodem
 * (extension PLSGOACancelReason). Dostępne dla aktywnego POZ pacjenta (REG.17429);
 * zablokowane, gdy realizacja została podjęta (REG.17638).
 */
export async function cancelSurveyResponse(
  client: SgoaClient,
  current: SurveyResponse | string,
  reason?: string,
): Promise<Result<SurveyResponse, P1Error>> {
  const loaded = await load(client, current);
  if (!loaded.ok) return loaded;
  const survey = loaded.value;

  const resource = { ...(asObject(survey.resource) ?? {}) };
  resource["status"] = "entered-in-error";
  const withoutReason = removeExtension(asArray(resource["extension"]), SGOA_EXT.CANCEL_REASON);
  resource["extension"] =
    reason !== undefined
      ? [...withoutReason, { url: SGOA_EXT.CANCEL_REASON, valueString: reason }]
      : withoutReason;
  const result = await client.update("QuestionnaireResponse", requireId(survey), resource);
  return map(result, parseSurveyResponse);
}

/**
 * Wycofuje anulowanie ankiety (`status=completed`, bez powodu anulowania).
 * Może to zrobić tylko placówka, która anulowała (REG.17430).
 */
export async function restoreSurveyResponse(
  client: SgoaClient,
  current: SurveyResponse | string,
): Promise<Result<SurveyResponse, P1Error>> {
  const loaded = await load(client, current);
  if (!loaded.ok) return loaded;
  const survey = loaded.value;
  if (survey.status !== "entered-in-error") {
    return err(new P1ValidationError("Wycofać anulowanie można tylko dla ankiety anulowanej"));
  }

  const resource = { ...(asObject(survey.resource) ?? {}) };
  resource["status"] = "completed";
  resource["extension"] = removeExtension(asArray(resource["extension"]), SGOA_EXT.CANCEL_REASON);
  const result = await client.update("QuestionnaireResponse", requireId(survey), resource);
  return map(result, parseSurveyResponse);
}

/** Wyszukuje ankiety pacjentów (w tym „oczekujące na podjęcie" po `pozLocationId`). */
export async function searchSurveyResponses(
  client: SgoaClient,
  params: SurveyResponseSearchParams = {},
): Promise<Result<SearchPage<SurveyResponse>, P1Error>> {
  const includes = (params.include ?? []).map((include) =>
    include === "exam-plan"
      ? "QuestionnaireResponse:based-on"
      : "QuestionnaireResponse:questionnaire",
  );
  const query: SgoaQuery = {
    _id: params.ids !== undefined && params.ids.length > 0 ? params.ids.join(",") : undefined,
    "program-code": params.programCode,
    "subject-identifier":
      params.patientPesel !== undefined ? `${SGOA_PESEL_SYSTEM}|${params.patientPesel}` : undefined,
    "subject-poz": params.pozLocationId,
    "subject-poz-doctor": params.pozPractitionerId,
    locked: params.locked !== undefined ? String(params.locked) : undefined,
    "survey-status": params.surveyStatus,
    created: params.created,
    _include: includes.length > 0 ? includes : undefined,
    _count: params.count !== undefined ? String(params.count) : undefined,
    _sort: params.sort,
    _total: params.accurateTotal ? "accurate" : undefined,
  };
  const result = await client.search("QuestionnaireResponse", query);
  return map(result, toSurveyPage);
}

/** Kolejna strona wyników `searchSurveyResponses`. */
export async function nextSurveyResponsesPage(
  client: SgoaClient,
  page: SearchPage<SurveyResponse>,
): Promise<Result<SearchPage<SurveyResponse>, P1Error> | undefined> {
  if (!page.nextUrl) return undefined;
  const result = await client.get(page.nextUrl);
  return map(result, toSurveyPage);
}

function toSurveyPage(bundle: unknown): SearchPage<SurveyResponse> {
  const total = bundleTotal(bundle);
  const nextUrl = bundleNextUrl(bundle);
  return {
    items: bundleResources(bundle, "QuestionnaireResponse").map(parseSurveyResponse),
    ...(total !== undefined ? { total } : {}),
    ...(nextUrl !== undefined ? { nextUrl } : {}),
    bundle,
  };
}

/** Parsuje zasób QuestionnaireResponse na typ domenowy. */
export function parseSurveyResponse(resource: unknown): SurveyResponse {
  const qr = asObject(resource) ?? {};
  const id = asString(qr["id"]);
  const status = asString(qr["status"]);
  const programCode = asString(extensionValue(qr, SGOA_EXT.PROGRAM_CODE));
  const privacyPolicyAcceptanceDate = asString(
    extensionValue(qr, SGOA_EXT.PRIVACY_POLICY_ACCEPTANCE_DATE),
  );
  const questionnaireUrl = asString(qr["questionnaire"]);
  const pesel = subjectPesel(qr);
  const examPlanId = asArray(qr["basedOn"])
    .map(asObject)
    .map((ref) => /^CarePlan\/(.+)$/.exec(asString(ref?.["reference"]) ?? "")?.[1])
    .find(Boolean);
  const surveyStatus = asString(asObject(extensionValue(qr, SGOA_EXT.SURVEY_STATUS))?.["code"]);
  const cancelReason = asString(extensionValue(qr, SGOA_EXT.CANCEL_REASON));

  return {
    ...(id !== undefined ? { id } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(programCode !== undefined ? { programCode } : {}),
    ...(privacyPolicyAcceptanceDate !== undefined ? { privacyPolicyAcceptanceDate } : {}),
    ...(questionnaireUrl !== undefined ? { questionnaireUrl } : {}),
    ...(pesel !== undefined ? { patientPesel: pesel } : {}),
    ...(examPlanId !== undefined ? { examPlanId } : {}),
    ...(surveyStatus !== undefined ? { surveyStatus } : {}),
    locked: asBoolean(extensionValue(qr, SGOA_EXT.SURVEY_LOCK)) ?? false,
    archivalVersion: asBoolean(extensionValue(qr, SGOA_EXT.ARCHIVAL_VERSION)) ?? false,
    ...(cancelReason !== undefined ? { cancelReason } : {}),
    modificationHistory: modificationHistory(qr),
    items: asArray(qr["item"]).map(parseResponseItem),
    resource,
  };
}

/** Parsuje drzewo odpowiedzi `item` (wspólne z podsumowaniem strukturalnym). */
export function parseResponseItem(raw: unknown): SurveyResponseItem {
  const item = asObject(raw) ?? {};
  const text = asString(item["text"]);
  return {
    linkId: asString(item["linkId"]) ?? "",
    ...(text !== undefined ? { text } : {}),
    answers: asArray(item["answer"])
      .map(asObject)
      .map(answerFromFhir)
      .filter((value): value is SurveyAnswerValue => value !== undefined),
    items: asArray(item["item"]).map(parseResponseItem),
  };
}

function answerFromFhir(answer: FhirObject | undefined): SurveyAnswerValue | undefined {
  if (!answer) return undefined;
  if (typeof answer["valueBoolean"] === "boolean") return answer["valueBoolean"];
  if (typeof answer["valueInteger"] === "number") return answer["valueInteger"];
  if (typeof answer["valueDecimal"] === "number") return answer["valueDecimal"];
  if (typeof answer["valueString"] === "string") return answer["valueString"];
  return undefined;
}

/* ------------------------------- pomocnicze ------------------------------- */

async function load(
  client: SgoaClient,
  current: SurveyResponse | string,
): Promise<Result<SurveyResponse, P1Error>> {
  return typeof current === "string" ? getSurveyResponse(client, current) : ok(current);
}

function requireId(survey: SurveyResponse): string {
  // Parsowane zasoby z serwera zawsze mają id; brak = błąd programisty.
  if (survey.id === undefined) throw new Error("SurveyResponse bez id - zasób nie z serwera?");
  return survey.id;
}

function editableGuard(survey: SurveyResponse): P1ValidationError | undefined {
  if (survey.locked) {
    return new P1ValidationError(
      "Ankieta zablokowana do edycji - realizacja zakresu badań została podjęta (REG.16978)",
    );
  }
  if (survey.archivalVersion) {
    return new P1ValidationError("Wersja archiwalna ankiety jest tylko do odczytu");
  }
  return undefined;
}

function removeExtension(extensionList: unknown[], url: string): unknown[] {
  return extensionList.filter((ext) => asObject(ext)?.["url"] !== url);
}

function replaceExtensionValue(
  extensionList: unknown[],
  url: string,
  value: Record<string, unknown>,
): unknown[] {
  const kept = removeExtension(extensionList, url);
  return [...kept, { url, ...value }];
}
