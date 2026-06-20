import { CDA_OID, type CdaSection } from "@p1/cda";
import { GENERAL_LOINC, GENERAL_TEMPLATE, INDUSTRY_CLASS_OID } from "./constants.js";

/** Miejsce realizacji skierowania (komórka organizacyjna). */
export interface ReferralPlace {
  /** Kod komórki organizacyjnej (klasyfikacja resortowa), np. "4100". */
  readonly code: string;
  readonly name: string;
}

export interface ProcedureInput {
  readonly icd9Code: string;
  readonly icd9Name: string;
}

export interface ReferralProcedures {
  readonly place: ReferralPlace;
  readonly procedures: readonly ProcedureInput[];
}

/**
 * Sekcja „Procedury": miejsce realizacji (encounter) + procedury ICD-9-PL.
 */
export function buildProceduresSection(input: ReferralProcedures): CdaSection {
  const procedureContentId = (index: number): string => `p1_procedura_icd9_kod_${index + 1}`;

  const placeParagraph = {
    "@ID": "ENC_1",
    content: [
      { "@ID": "p1_miejsce_opis", "@styleCode": "Bold", "#": "Miejsce:" },
      { "@ID": "p1_miejsce_kod", "#": input.place.code },
      { "@ID": "p1_poradnia_rodzaj", "#": input.place.name },
    ],
  };
  const procedureParagraphs = input.procedures.map((procedure, index) => ({
    "@ID": `p1_procedura_pozycja_${index + 1}`,
    content: [
      { "@ID": `p1_procedura_opis_${index + 1}`, "@styleCode": "Bold", "#": "Rodzaj procedury:" },
      { "@ID": `p1_procedura_icd9_opis_${index + 1}`, "#": "ICD9:" },
      { "@ID": procedureContentId(index), "#": procedure.icd9Code },
      { "@ID": `p1_procedura_icd9_tekst_${index + 1}`, "#": procedure.icd9Name },
    ],
  }));

  return {
    templateId: { "@root": GENERAL_TEMPLATE.PROCEDURES_SECTION },
    code: {
      "@code": GENERAL_LOINC.PROCEDURES,
      "@codeSystem": CDA_OID.LOINC,
      "@codeSystemName": "LOINC",
      "@displayName": "Prescriptions",
    },
    title: "Procedury",
    text: { paragraph: [placeParagraph, ...procedureParagraphs] },
    entry: {
      templateId: { "@root": GENERAL_TEMPLATE.PROCEDURE_ENTRY },
      encounter: {
        "@classCode": "ENC",
        "@moodCode": "RQO",
        code: {
          "@code": input.place.code,
          "@codeSystem": INDUSTRY_CLASS_OID,
          "@displayName": input.place.name,
        },
        text: { reference: { "@value": "#ENC_1" } },
        entryRelationship: input.procedures.map((procedure, index) => ({
          "@typeCode": "COMP",
          procedure: {
            "@classCode": "PROC",
            "@moodCode": "RQO",
            code: {
              "@code": procedure.icd9Code,
              "@codeSystem": CDA_OID.ICD9_PL,
              "@codeSystemName": "ICD-9-PL",
              "@displayName": procedure.icd9Name,
            },
            text: { reference: { "@value": `#${procedureContentId(index)}` } },
          },
        })),
      },
    },
  };
}
