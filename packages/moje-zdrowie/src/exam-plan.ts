import { err, map, ok, type P1Error, P1ValidationError, type Result } from "@p1/core";
import {
  bundleNextUrl,
  bundleResources,
  bundleTotal,
  type SgoaClient,
  type SgoaQuery,
} from "./client.js";
import {
  SGOA_CODE_SYSTEM,
  SGOA_EXAM_CODE_SYSTEM,
  SGOA_EXT,
  SGOA_PESEL_SYSTEM,
} from "./constants.js";
import {
  asArray,
  asBoolean,
  asObject,
  asString,
  extensionValue,
  modificationHistory,
  subjectPesel,
} from "./fhir.js";
import type {
  ExamPlan,
  ExamPlanActivity,
  ExamPlanSearchParams,
  ExamPlanStatus,
  SearchPage,
} from "./types.js";

/**
 * Zakres badań (CarePlan, profil PLSGOACarePlan). Zasób tworzy WYŁĄCZNIE
 * system P1 przy zapisie ankiety; klient odczytuje go i steruje realizacją
 * przez zmiany statusu (`PUT` pełnego zasobu):
 *
 *   draft ⇄ active ⇄ on-hold ⇄ completed   (+ active⇄completed)
 *
 * Przyjęcie do realizacji (draft→active) blokuje edycję ankiety; wycofanie
 * realizacji (→draft) ją odblokowuje. `entered-in-error` ustawia tylko system.
 */

/** Odczytuje zakres badań po identyfikatorze (id z `SurveyResponse.examPlanId`). */
export async function getExamPlan(
  client: SgoaClient,
  id: string,
): Promise<Result<ExamPlan, P1Error>> {
  const result = await client.read("CarePlan", id);
  return map(result, parseExamPlan);
}

/** Wyszukuje zakresy badań. */
export async function searchExamPlans(
  client: SgoaClient,
  params: ExamPlanSearchParams = {},
): Promise<Result<SearchPage<ExamPlan>, P1Error>> {
  const query: SgoaQuery = {
    _id: params.ids !== undefined && params.ids.length > 0 ? params.ids.join(",") : undefined,
    "program-code": params.programCode,
    "subject-identifier":
      params.patientPesel !== undefined ? `${SGOA_PESEL_SYSTEM}|${params.patientPesel}` : undefined,
    "subject-poz": params.pozLocationId,
    "subject-poz-doctor": params.pozPractitionerId,
    "period-start": params.periodStart,
    created: params.created,
    _count: params.count !== undefined ? String(params.count) : undefined,
    _sort: params.sort,
    _total: params.accurateTotal ? "accurate" : undefined,
  };
  const result = await client.search("CarePlan", query);
  return map(result, toExamPlanPage);
}

/** Kolejna strona wyników `searchExamPlans`. */
export async function nextExamPlansPage(
  client: SgoaClient,
  page: SearchPage<ExamPlan>,
): Promise<Result<SearchPage<ExamPlan>, P1Error> | undefined> {
  if (!page.nextUrl) return undefined;
  const result = await client.get(page.nextUrl);
  return map(result, toExamPlanPage);
}

/**
 * Przyjęcie zakresu badań do realizacji (draft→active). Blokuje edycję ankiety.
 * Tylko placówka POZ pacjenta (REG.16996).
 */
export function acceptExamPlan(
  client: SgoaClient,
  current: ExamPlan | string,
  params: { readonly startDate: string; readonly note?: string },
): Promise<Result<ExamPlan, P1Error>> {
  return transition(client, current, ["draft"], "active", (resource) => {
    resource["period"] = { start: params.startDate };
    setNote(resource, params.note);
  });
}

/** Rozpoczęcie oczekiwania na wizytę podsumowującą (active→on-hold). */
export function holdExamPlan(
  client: SgoaClient,
  current: ExamPlan | string,
  params: { readonly note?: string } = {},
): Promise<Result<ExamPlan, P1Error>> {
  return transition(client, current, ["active"], "on-hold", (resource) =>
    setNote(resource, params.note),
  );
}

/** Zakończenie realizacji zakresu badań (active|on-hold→completed). */
export function completeExamPlan(
  client: SgoaClient,
  current: ExamPlan | string,
  params: { readonly note?: string } = {},
): Promise<Result<ExamPlan, P1Error>> {
  return transition(client, current, ["active", "on-hold"], "completed", (resource) =>
    setNote(resource, params.note),
  );
}

/** Wycofanie do realizacji badań (on-hold|completed→active). */
export function reopenExamPlan(
  client: SgoaClient,
  current: ExamPlan | string,
  params: { readonly note?: string } = {},
): Promise<Result<ExamPlan, P1Error>> {
  return transition(client, current, ["on-hold", "completed"], "active", (resource) =>
    setNote(resource, params.note),
  );
}

/** Wycofanie do oczekiwania na wizytę podsumowującą (completed→on-hold). */
export function backToHoldExamPlan(
  client: SgoaClient,
  current: ExamPlan | string,
  params: { readonly note?: string } = {},
): Promise<Result<ExamPlan, P1Error>> {
  return transition(client, current, ["completed"], "on-hold", (resource) =>
    setNote(resource, params.note),
  );
}

/**
 * Wycofanie realizacji (active|on-hold|completed→draft) - usuwa datę podjęcia
 * (`period`, wymóg P1) i odblokowuje edycję ankiety.
 */
export function withdrawExamPlan(
  client: SgoaClient,
  current: ExamPlan | string,
  params: { readonly clearNote?: boolean } = {},
): Promise<Result<ExamPlan, P1Error>> {
  return transition(client, current, ["active", "on-hold", "completed"], "draft", (resource) => {
    delete resource["period"];
    if (params.clearNote) delete resource["note"];
  });
}

/** Wspólny przebieg przejścia statusu: odczyt → walidacja → mutacja → PUT. */
async function transition(
  client: SgoaClient,
  current: ExamPlan | string,
  allowedFrom: readonly ExamPlanStatus[],
  target: ExamPlanStatus,
  mutate: (resource: Record<string, unknown>) => void,
): Promise<Result<ExamPlan, P1Error>> {
  const loaded = typeof current === "string" ? await getExamPlan(client, current) : ok(current);
  if (!loaded.ok) return loaded;
  const plan = loaded.value;

  if (plan.status === undefined || !allowedFrom.includes(plan.status as ExamPlanStatus)) {
    return err(
      new P1ValidationError(
        `Przejście do statusu ${target} wymaga statusu ${allowedFrom.join("/")}, a zakres badań ma ${plan.status ?? "brak"}`,
      ),
    );
  }
  if (plan.id === undefined) {
    return err(new P1ValidationError("Zakres badań bez id - zasób nie pochodzi z serwera"));
  }

  const resource = { ...(asObject(plan.resource) ?? {}) };
  resource["status"] = target;
  mutate(resource);
  const result = await client.update("CarePlan", plan.id, resource);
  return map(result, parseExamPlan);
}

function setNote(resource: Record<string, unknown>, note: string | undefined): void {
  if (note === undefined) return;
  resource["note"] = [{ text: note }];
}

function toExamPlanPage(bundle: unknown): SearchPage<ExamPlan> {
  const total = bundleTotal(bundle);
  const nextUrl = bundleNextUrl(bundle);
  return {
    items: bundleResources(bundle, "CarePlan").map(parseExamPlan),
    ...(total !== undefined ? { total } : {}),
    ...(nextUrl !== undefined ? { nextUrl } : {}),
    bundle,
  };
}

/** Parsuje zasób CarePlan (profil PLSGOACarePlan) na typ domenowy. */
export function parseExamPlan(resource: unknown): ExamPlan {
  const plan = asObject(resource) ?? {};
  const id = asString(plan["id"]);
  const status = asString(plan["status"]);
  const programCode = asString(extensionValue(plan, SGOA_EXT.PROGRAM_CODE));
  const pesel = subjectPesel(plan);
  const startDate = asString(asObject(plan["period"])?.["start"]);
  const note = asArray(plan["note"])
    .map(asObject)
    .map((n) => asString(n?.["text"]))
    .find(Boolean);

  return {
    ...(id !== undefined ? { id } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(programCode !== undefined ? { programCode } : {}),
    ...(pesel !== undefined ? { patientPesel: pesel } : {}),
    ...(startDate !== undefined ? { startDate } : {}),
    ...(note !== undefined ? { note } : {}),
    activities: asArray(plan["activity"]).map(parseActivity),
    archivalVersion: asBoolean(extensionValue(plan, SGOA_EXT.ARCHIVAL_VERSION)) ?? false,
    modificationHistory: modificationHistory(plan),
    resource,
  };
}

function parseActivity(raw: unknown): ExamPlanActivity {
  const detail = asObject(asObject(raw)?.["detail"]) ?? {};
  const coding = asArray(asObject(detail["code"])?.["coding"])
    .map(asObject)
    .find((c) => c?.["system"] === SGOA_EXAM_CODE_SYSTEM);
  const procedureType = asArray(detail["reasonCode"])
    .map(asObject)
    .flatMap((reason) => asArray(reason?.["coding"]).map(asObject))
    .filter((c) => c?.["system"] === SGOA_CODE_SYSTEM.PROCEDURE_TYPE)
    .map((c) => asString(c?.["code"]))
    .find(Boolean);
  const code = asString(coding?.["code"]);
  const display = asString(coding?.["display"]);
  const description = asString(detail["description"]);
  const status = asString(detail["status"]);

  return {
    ...(code !== undefined ? { code } : {}),
    ...(display !== undefined ? { display } : {}),
    ...(procedureType !== undefined ? { procedureType } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(status !== undefined ? { status } : {}),
  };
}
