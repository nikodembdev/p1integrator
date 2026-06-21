import { CDA_OID, type CdaSection } from "@p1/cda";
import {
  buildNarrativeSection,
  buildRequestedEncounterEntry,
  type ReferralDiagnoses,
  type RequestedEncounter,
} from "../common/index.js";
import { PSYCHIATRIC_LOINC, PSYCHIATRIC_TEMPLATE } from "./constants.js";

/** Sekcja narracyjna „Wywiad społeczny" (.3.17). */
export function buildPsychiatricSocialHistorySection(text: string): CdaSection {
  return buildNarrativeSection({
    templateId: PSYCHIATRIC_TEMPLATE.SOCIAL_HISTORY_SECTION,
    loincCode: PSYCHIATRIC_LOINC.SOCIAL_HISTORY,
    loincDisplay: "Social history",
    title: "Wywiad społeczny",
    text,
    contentId: "p1_wywiad_spol",
  });
}

/** Sekcja narracyjna „Powód skierowania" (.3.22). */
export function buildPsychiatricReasonForReferralSection(text: string): CdaSection {
  return buildNarrativeSection({
    templateId: PSYCHIATRIC_TEMPLATE.REASON_SECTION,
    loincCode: PSYCHIATRIC_LOINC.REASON,
    loincDisplay: "Reason for referral",
    title: "Powód skierowania",
    text,
    contentId: "p1_powod_skierowania",
  });
}

/**
 * Sekcja „Rozpoznania" psychiatryczna (.3.20). Model zamknięty: dozwolone tylko
 * templateId/id/code/title/text - sekcja jest WYŁĄCZNIE narracyjna (bez wpisów .4.1/.4.2,
 * w przeciwieństwie do współdzielonej sekcji .3.1).
 */
export function buildPsychiatricDiagnosisSection(diagnoses: ReferralDiagnoses): CdaSection {
  const all = [diagnoses.main, ...(diagnoses.secondary ?? [])];
  return {
    templateId: { "@root": PSYCHIATRIC_TEMPLATE.DIAGNOSIS_SECTION },
    code: {
      "@code": PSYCHIATRIC_LOINC.DIAGNOSIS,
      "@codeSystem": CDA_OID.LOINC,
      "@codeSystemName": "LOINC",
      "@displayName": "Diagnosis",
    },
    title: "Rozpoznania",
    text: {
      paragraph: {
        caption: "Rozpoznania wg ICD-10:",
        content: all.map((diagnosis, index) => ({
          "@ID": `OBS_${index + 1}`,
          "#": `${diagnosis.icd10Code} ${diagnosis.description}`,
        })),
      },
    },
  };
}

/** Przedmiot skierowania psychiatrycznego (alias wspólnego typu). */
export type PsychiatricEncounter = RequestedEncounter;

/**
 * Sekcja „Przedmiot skierowania" (.3.21): obowiązkowy wpis encounter (ENC/RQO, .4.11)
 * z kodem specjalności komórki psychiatrycznej.
 */
export function buildPsychiatricPrescriptionsSection(encounter: PsychiatricEncounter): CdaSection {
  return {
    templateId: { "@root": PSYCHIATRIC_TEMPLATE.PRESCRIPTIONS_SECTION },
    code: {
      "@code": PSYCHIATRIC_LOINC.PRESCRIPTIONS,
      "@codeSystem": CDA_OID.LOINC,
      "@codeSystemName": "LOINC",
      "@displayName": "Prescriptions",
    },
    title: "Przedmiot skierowania",
    text: {
      content: {
        "@ID": "p1_przedmiot_skierowania",
        "#": `${encounter.cellCode} ${encounter.cellName}`,
      },
    },
    entry: buildRequestedEncounterEntry(
      PSYCHIATRIC_TEMPLATE.REQUESTED_ENCOUNTER_ENTRY,
      encounter,
      "p1_przedmiot_skierowania",
    ),
  };
}
