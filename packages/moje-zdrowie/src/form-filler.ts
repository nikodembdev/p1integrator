import type {
  SurveyAnswerValue,
  SurveyDefinition,
  SurveyDefinitionItem,
  SurveyResponseItemInput,
} from "./types.js";

/**
 * Automatyczne wypełnianie definicji ankiety (do testów/demo): generuje komplet
 * odpowiedzi na pytania AKTYWNE wg warunków `enableWhen`. Odpowiedź na pytanie
 * może uaktywnić kolejne pytania (np. „Tak" przy nowotworach w rodzinie odsłania
 * pytania o konkretne nowotwory) - dlatego wypełnianie iteruje do punktu stałego.
 *
 * Wartości domyślne: boolean=false, integer=min|1, decimal=nieintegralna wartość
 * w granicach (serwer P1 odrzuca `valueDecimal` bez części ułamkowej jako integer),
 * choice=pierwszy wariant, string="brak". Pola wyliczane (np. BMI) trzeba podać
 * przez `overrides` - serwer weryfikuje ich zgodność z wyrażeniem (REG.16969).
 */
export interface FillSurveyOptions {
  /** Wymuszone odpowiedzi per linkId (nadpisują wartości domyślne). */
  readonly overrides?: Readonly<Record<string, readonly SurveyAnswerValue[]>>;
  /** Wybór wariantu dla pytań choice (domyślnie pierwszy z listy). */
  readonly chooseOption?: (item: SurveyDefinitionItem) => string | undefined;
}

/** Wypełnia definicję ankiety odpowiedziami na wszystkie aktywne pytania. */
export function fillSurveyDefinition(
  definition: SurveyDefinition,
  options: FillSurveyOptions = {},
): SurveyResponseItemInput[] {
  // Punkt stały: powtarzamy przydzielanie odpowiedzi, aż żadne nowe pytanie
  // nie stanie się aktywne (łańcuchy enableWhen).
  const answers = new Map<string, readonly SurveyAnswerValue[]>();
  for (;;) {
    let changed = false;
    const visit = (item: SurveyDefinitionItem): void => {
      if (item.type === "group") {
        for (const child of item.items ?? []) visit(child);
        return;
      }
      if (answers.has(item.linkId) || !isEnabled(item, answers)) return;
      const value = answerFor(item, options);
      if (value !== undefined) {
        answers.set(item.linkId, value);
        changed = true;
      }
    };
    for (const item of definition.items) visit(item);
    if (!changed) break;
  }

  const build = (item: SurveyDefinitionItem): SurveyResponseItemInput | undefined => {
    const base = { linkId: item.linkId, text: item.text ?? item.linkId };
    if (item.type === "group") {
      const children = (item.items ?? [])
        .map(build)
        .filter((child): child is SurveyResponseItemInput => child !== undefined);
      return children.length > 0 ? { ...base, items: children } : undefined;
    }
    const value = answers.get(item.linkId);
    return value !== undefined ? { ...base, answers: value } : undefined;
  };
  return definition.items
    .map(build)
    .filter((item): item is SurveyResponseItemInput => item !== undefined);
}

/** Czy pytanie jest aktywne wg `enableWhen` i dotychczasowych odpowiedzi. */
function isEnabled(
  item: SurveyDefinitionItem,
  answers: ReadonlyMap<string, readonly SurveyAnswerValue[]>,
): boolean {
  const conditions = item.enableWhen ?? [];
  if (conditions.length === 0) return true;
  const results = conditions.map((condition) => evaluate(condition, answers));
  return item.enableBehavior === "all" ? results.every(Boolean) : results.some(Boolean);
}

function evaluate(
  condition: Record<string, unknown>,
  answers: ReadonlyMap<string, readonly SurveyAnswerValue[]>,
): boolean {
  const question = typeof condition["question"] === "string" ? condition["question"] : "";
  const operator = typeof condition["operator"] === "string" ? condition["operator"] : "=";
  const given = answers.get(question);
  const expected = expectedValue(condition);

  if (operator === "exists") {
    const shouldExist = condition["answerBoolean"] !== false;
    return (given !== undefined) === shouldExist;
  }
  if (given === undefined) return false;
  return given.some((value) => {
    const plain = plainValue(value);
    switch (operator) {
      case "=":
        return plain === expected;
      case "!=":
        return plain !== expected;
      case ">":
        return typeof plain === "number" && typeof expected === "number" && plain > expected;
      case "<":
        return typeof plain === "number" && typeof expected === "number" && plain < expected;
      case ">=":
        return typeof plain === "number" && typeof expected === "number" && plain >= expected;
      case "<=":
        return typeof plain === "number" && typeof expected === "number" && plain <= expected;
      default:
        return false;
    }
  });
}

function expectedValue(condition: Record<string, unknown>): SurveyAnswerValue | undefined {
  for (const key of ["answerString", "answerBoolean", "answerInteger", "answerDecimal"]) {
    const value = condition[key];
    if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
      return value;
    }
  }
  return undefined;
}

function plainValue(value: SurveyAnswerValue): boolean | number | string {
  if (typeof value === "object") return "decimal" in value ? value.decimal : value.integer;
  return value;
}

/** Domyślna odpowiedź dla pytania danego typu (undefined = pomiń pytanie). */
function answerFor(
  item: SurveyDefinitionItem,
  options: FillSurveyOptions,
): readonly SurveyAnswerValue[] | undefined {
  const override = options.overrides?.[item.linkId];
  if (override !== undefined) return override;
  switch (item.type) {
    case "boolean":
      return [false];
    case "integer":
      return [item.minValue ?? 1];
    case "decimal": {
      // Nieintegralna wartość w granicach - serwer P1 wymaga części ułamkowej,
      // bo JSON nie odróżnia `1` (integer) od `1.0` (decimal).
      const min = item.minValue ?? 0;
      const candidate = min + 0.5;
      const max = item.maxValue;
      return [{ decimal: max !== undefined && candidate > max ? max - 0.1 : candidate }];
    }
    case "choice": {
      const chosen = options.chooseOption?.(item) ?? item.answerOptions?.[0]?.value;
      return chosen !== undefined ? [chosen] : undefined;
    }
    case "string":
      return ["brak"];
    default:
      return undefined;
  }
}
