import { describe, expect, it } from "vitest";
import { fillSurveyDefinition } from "./form-filler.js";
import type { SurveyDefinition, SurveyResponseItemInput } from "./types.js";

/** Definicja z łańcuchem enableWhen wzorowanym na realnej ankiecie Moje Zdrowie. */
const definition: SurveyDefinition = {
  items: [
    {
      linkId: "grupa",
      type: "group",
      items: [
        { linkId: "wzrost", type: "integer", minValue: 50, maxValue: 250 },
        { linkId: "masa-ciala", type: "decimal", minValue: 20 },
        {
          linkId: "nowotwory",
          type: "choice",
          answerOptions: [{ value: "Tak" }, { value: "Nie" }],
        },
        {
          // Aktywne tylko przy "Tak" - domyślny wybór (pierwszy wariant) je odsłania.
          linkId: "rak-piersi",
          type: "choice",
          enableWhen: [{ question: "nowotwory", operator: "=", answerString: "Tak" }],
          enableBehavior: "all",
          answerOptions: [{ value: "Nie" }, { value: "Tak" }],
        },
        {
          // Wiele warunków z any - wystarczy jeden pasujący.
          linkId: "palenie-ile",
          type: "integer",
          minValue: 1,
          enableWhen: [
            { question: "palenie", operator: "=", answerString: "Tak, papierosy" },
            { question: "palenie", operator: "=", answerString: "Tak, tytoń" },
          ],
          enableBehavior: "any",
        },
        {
          linkId: "palenie",
          type: "choice",
          answerOptions: [{ value: "Nie" }, { value: "Tak, papierosy" }],
        },
      ],
    },
  ],
  resource: {},
};

const flat = (items: readonly SurveyResponseItemInput[]): Map<string, SurveyResponseItemInput> => {
  const map = new Map<string, SurveyResponseItemInput>();
  const walk = (list: readonly SurveyResponseItemInput[]): void => {
    for (const item of list) {
      map.set(item.linkId, item);
      walk(item.items ?? []);
    }
  };
  walk(items);
  return map;
};

describe("fillSurveyDefinition", () => {
  it("odpowiada na pytania aktywowane własnymi odpowiedziami (fixpoint)", () => {
    const filled = flat(fillSurveyDefinition(definition));
    // "nowotwory" dostało pierwszy wariant "Tak" → "rak-piersi" musi być wypełnione.
    expect(filled.get("nowotwory")?.answers).toEqual(["Tak"]);
    expect(filled.get("rak-piersi")?.answers).toEqual(["Nie"]);
  });

  it("pomija pytania nieaktywne (warunek niespełniony)", () => {
    const filled = flat(fillSurveyDefinition(definition));
    // "palenie" = "Nie" (pierwszy wariant) → "palenie-ile" nieaktywne.
    expect(filled.get("palenie")?.answers).toEqual(["Nie"]);
    expect(filled.has("palenie-ile")).toBe(false);
  });

  it("reaguje na chooseOption - inne odpowiedzi odsłaniają inne pytania", () => {
    const filled = flat(
      fillSurveyDefinition(definition, {
        chooseOption: (item) =>
          item.linkId === "palenie" ? "Tak, papierosy" : item.answerOptions?.[0]?.value,
      }),
    );
    expect(filled.get("palenie-ile")?.answers).toEqual([1]);
  });

  it("generuje decimal z częścią ułamkową w granicach min/max", () => {
    const filled = flat(fillSurveyDefinition(definition));
    const masa = filled.get("masa-ciala")?.answers?.[0];
    expect(masa).toEqual({ decimal: 20.5 });
    const wzrost = filled.get("wzrost")?.answers?.[0];
    expect(wzrost).toBe(50);
  });

  it("respektuje overrides (np. pola wyliczane jak BMI)", () => {
    const filled = flat(
      fillSurveyDefinition(definition, {
        overrides: { wzrost: [175], "masa-ciala": [{ decimal: 80.5 }] },
      }),
    );
    expect(filled.get("wzrost")?.answers).toEqual([175]);
    expect(filled.get("masa-ciala")?.answers).toEqual([{ decimal: 80.5 }]);
  });

  it("pomija grupy bez żadnej aktywnej odpowiedzi", () => {
    const empty: SurveyDefinition = {
      items: [
        {
          linkId: "grupa",
          type: "group",
          items: [
            {
              linkId: "warunkowe",
              type: "string",
              enableWhen: [{ question: "brak", operator: "=", answerString: "x" }],
            },
          ],
        },
      ],
      resource: {},
    };
    expect(fillSurveyDefinition(empty)).toEqual([]);
  });
});
