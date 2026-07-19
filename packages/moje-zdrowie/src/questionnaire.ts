import { map, type P1Error, type Result } from "@p1/core";
import { bundleNextUrl, bundleResources, bundleTotal, type SgoaClient } from "./client.js";
import { MOJE_ZDROWIE_PROGRAM_CODE, SGOA_CODE_SYSTEM, SGOA_EXT } from "./constants.js";
import {
  asArray,
  asBoolean,
  asNumber,
  asObject,
  asString,
  extensionValue,
  type FhirObject,
} from "./fhir.js";
import type {
  SearchPage,
  SurveyAnswerOption,
  SurveyDefinition,
  SurveyDefinitionItem,
  SurveyDefinitionSearchParams,
} from "./types.js";

/**
 * Definicje ankiet (Questionnaire) - w SGO-A wyłącznie do odczytu; tworzy
 * i wersjonuje je CeZ. Na integracji dostępne są 4 warianty `Moje-Zdrowie.1-4`
 * (płeć × wiek 20-59 / 60-120).
 */

/**
 * Wyszukuje ankiety DOSTĘPNE dla pacjenta operacją `$eligible` - serwer
 * uwzględnia wiek, płeć, okres obowiązywania definicji i już istniejące
 * ankiety pacjenta (w tym karencję po Profilaktyce 40+).
 */
export async function findEligibleQuestionnaires(
  client: SgoaClient,
  params: { readonly pesel: string; readonly programCode?: string },
): Promise<Result<readonly SurveyDefinition[], P1Error>> {
  const programCode = params.programCode ?? MOJE_ZDROWIE_PROGRAM_CODE;
  const query = new URLSearchParams({ pesel: params.pesel, "program-code": programCode });
  const result = await client.get(`Questionnaire/$eligible?${query.toString()}`);
  return map(result, (bundle) =>
    bundleResources(bundle, "Questionnaire").map(parseSurveyDefinition),
  );
}

/** Wyszukuje definicje ankiet po kryteriach (wiek/płeć/kod programu). */
export async function searchQuestionnaires(
  client: SgoaClient,
  params: SurveyDefinitionSearchParams = {},
): Promise<Result<SearchPage<SurveyDefinition>, P1Error>> {
  const result = await client.search("Questionnaire", {
    "program-code": params.programCode,
    age: params.age !== undefined ? String(params.age) : undefined,
    gender: params.gender,
    _count: params.count !== undefined ? String(params.count) : undefined,
    _sort: params.sort,
    _total: params.accurateTotal ? "accurate" : undefined,
  });
  return map(result, toDefinitionPage);
}

/** Kolejna strona wyników `searchQuestionnaires`. */
export async function nextQuestionnairesPage(
  client: SgoaClient,
  page: SearchPage<SurveyDefinition>,
): Promise<Result<SearchPage<SurveyDefinition>, P1Error> | undefined> {
  if (!page.nextUrl) return undefined;
  const result = await client.get(page.nextUrl);
  return map(result, toDefinitionPage);
}

/** Odczytuje definicję ankiety po identyfikatorze (np. `Moje-Zdrowie.2`). */
export async function getQuestionnaire(
  client: SgoaClient,
  id: string,
): Promise<Result<SurveyDefinition, P1Error>> {
  const result = await client.read("Questionnaire", id);
  return map(result, parseSurveyDefinition);
}

function toDefinitionPage(bundle: unknown): SearchPage<SurveyDefinition> {
  const total = bundleTotal(bundle);
  const nextUrl = bundleNextUrl(bundle);
  return {
    items: bundleResources(bundle, "Questionnaire").map(parseSurveyDefinition),
    ...(total !== undefined ? { total } : {}),
    ...(nextUrl !== undefined ? { nextUrl } : {}),
    bundle,
  };
}

/** Parsuje zasób Questionnaire (profil PLSGOAQuestionnaire) na typ domenowy. */
export function parseSurveyDefinition(resource: unknown): SurveyDefinition {
  const q = asObject(resource) ?? {};
  const code = asArray(q["code"])
    .map(asObject)
    .find((c) => c?.["system"] === SGOA_CODE_SYSTEM.SURVEY_TYPE);
  const useContexts = asArray(q["useContext"]).map(asObject);
  const gender = useContexts
    .map((ctx) => {
      if (codeOf(ctx?.["code"]) !== "gender") return undefined;
      return asArray(asObject(ctx?.["valueCodeableConcept"])?.["coding"])
        .map(asObject)
        .map((coding) => asString(coding?.["code"]))
        .find(Boolean);
    })
    .find(Boolean);
  const ageRangeRaw = useContexts
    .map((ctx) => (codeOf(ctx?.["code"]) === "age" ? asObject(ctx?.["valueRange"]) : undefined))
    .find(Boolean);
  const low = asNumber(asObject(ageRangeRaw?.["low"])?.["value"]);
  const high = asNumber(asObject(ageRangeRaw?.["high"])?.["value"]);
  const id = asString(q["id"]);
  const url = asString(q["url"]);
  const version = asString(q["version"]);
  const title = asString(q["title"]);
  const description = asString(q["description"]);
  const purpose = asString(q["purpose"]);
  const programCode = asString(code?.["code"]);
  const effectiveFrom = asString(asObject(q["effectivePeriod"])?.["start"]);

  return {
    ...(id !== undefined ? { id } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(version !== undefined ? { version } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(purpose !== undefined ? { purpose } : {}),
    ...(programCode !== undefined ? { programCode } : {}),
    ...(effectiveFrom !== undefined ? { effectiveFrom } : {}),
    ...(gender !== undefined ? { gender } : {}),
    ...(ageRangeRaw
      ? {
          ageRange: {
            ...(low !== undefined ? { low } : {}),
            ...(high !== undefined ? { high } : {}),
          },
        }
      : {}),
    items: asArray(q["item"]).map(parseDefinitionItem),
    resource,
  };
}

function codeOf(coding: unknown): string | undefined {
  return asString(asObject(coding)?.["code"]);
}

function parseDefinitionItem(raw: unknown): SurveyDefinitionItem {
  const item = asObject(raw) ?? {};
  const text = asString(item["text"]);
  const required = asBoolean(item["required"]);
  const readOnly = asBoolean(item["readOnly"]);
  const enableWhen = asArray(item["enableWhen"])
    .map(asObject)
    .filter((e): e is FhirObject => e !== undefined);
  const answerOptions = asArray(item["answerOption"]).map(parseAnswerOption);
  const tooltip = asString(extensionValue(item, SGOA_EXT.TOOLTIP));
  const minValue = numericExtension(item, SGOA_EXT.MIN_VALUE);
  const maxValue = numericExtension(item, SGOA_EXT.MAX_VALUE);
  const itemControl = itemControlCode(item);
  const calculatedExpression = asString(extensionValue(item, SGOA_EXT.CALCULATED_EXPRESSION));
  const fhirPathExpression = asString(
    asObject(extensionValue(item, SGOA_EXT.SDC_CALCULATED_EXPRESSION))?.["expression"],
  );
  const children = asArray(item["item"]);

  return {
    linkId: asString(item["linkId"]) ?? "",
    ...(text !== undefined ? { text } : {}),
    type: asString(item["type"]) ?? "",
    ...(required !== undefined ? { required } : {}),
    ...(readOnly !== undefined ? { readOnly } : {}),
    ...(enableWhen.length > 0 ? { enableWhen } : {}),
    ...(answerOptions.length > 0 ? { answerOptions } : {}),
    ...(tooltip !== undefined ? { tooltip } : {}),
    ...(minValue !== undefined ? { minValue } : {}),
    ...(maxValue !== undefined ? { maxValue } : {}),
    ...(itemControl !== undefined ? { itemControl } : {}),
    ...(calculatedExpression !== undefined ? { calculatedExpression } : {}),
    ...(fhirPathExpression !== undefined ? { fhirPathExpression } : {}),
    ...(children.length > 0 ? { items: children.map(parseDefinitionItem) } : {}),
  };
}

function parseAnswerOption(raw: unknown): SurveyAnswerOption {
  const option = asObject(raw) ?? {};
  const display = asString(extensionValue(option, SGOA_EXT.ANSWER_OPTION_DISPLAY));
  const initialSelected = asBoolean(option["initialSelected"]);
  return {
    value: asString(option["valueString"]) ?? "",
    ...(display !== undefined ? { display } : {}),
    ...(initialSelected !== undefined ? { initialSelected } : {}),
  };
}

/** Wartość min/max: standardowe extensions mają `valueInteger`/`valueDecimal`. */
function numericExtension(item: unknown, url: string): number | undefined {
  return asNumber(extensionValue(item, url));
}

function itemControlCode(item: unknown): string | undefined {
  const value = asObject(extensionValue(item, SGOA_EXT.QUESTIONNAIRE_ITEM_CONTROL));
  const fromConcept = asArray(value?.["coding"])
    .map(asObject)
    .map((coding) => asString(coding?.["code"]))
    .find(Boolean);
  return fromConcept ?? asString(extensionValue(item, SGOA_EXT.QUESTIONNAIRE_ITEM_CONTROL));
}
