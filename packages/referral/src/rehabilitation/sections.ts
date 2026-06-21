import { CDA_OID, type CdaSection } from "@p1/cda";
import { CONTRAINDICATIONS_LOINC, REHABILITATION_TEMPLATE } from "./constants.js";

/**
 * Sekcja „Przeciwwskazania" (narracyjna). Schematron wymaga: templateId .3.72,
 * code 48767-8 (LOINC), title dokładnie „Przeciwwskazania" oraz niepustego text.
 * Brak obowiązkowych wpisów (entry) - wyłącznie opis tekstowy.
 */
export function buildContraindicationsSection(contraindications: string): CdaSection {
  return {
    templateId: { "@root": REHABILITATION_TEMPLATE.CONTRAINDICATIONS_SECTION },
    code: {
      "@code": CONTRAINDICATIONS_LOINC,
      "@codeSystem": CDA_OID.LOINC,
      "@codeSystemName": "LOINC",
      "@displayName": "Annotation comment",
    },
    title: "Przeciwwskazania",
    text: { content: { "@ID": "p1_przeciwwskazania", "#": contraindications } },
  };
}
