import { CDA_OID, type CdaSection } from "@p1/cda";
import { buildNarrativeSection, buildRequestedEncounterEntry } from "../common/index.js";
import {
  OCCUPATIONAL_DISEASE_OID,
  OCCUPATIONAL_LOINC,
  OCCUPATIONAL_MEDICINE_CELL,
  OCCUPATIONAL_TEMPLATE,
} from "./constants.js";

/** Sekcja narracyjna „Wywiad zawodowy" (.3.23, tytuł wymagany). */
export function buildOccupationHistorySection(text: string): CdaSection {
  return buildNarrativeSection({
    templateId: OCCUPATIONAL_TEMPLATE.OCCUPATION_HISTORY_SECTION,
    loincCode: OCCUPATIONAL_LOINC.OCCUPATION_HISTORY,
    loincDisplay: "History of occupation",
    title: "Wywiad zawodowy",
    text,
    contentId: "p1_wywiad_zawodowy",
  });
}

/** Sekcja narracyjna „Czynniki narażenia zawodowego" (.3.25, tytuł wymagany). */
export function buildOccupationalExposureSection(text: string): CdaSection {
  return buildNarrativeSection({
    templateId: OCCUPATIONAL_TEMPLATE.EXPOSURE_SECTION,
    loincCode: OCCUPATIONAL_LOINC.EXPOSURE,
    loincDisplay: "History of occupational exposure",
    title: "Czynniki narażenia zawodowego",
    text,
    contentId: "p1_narazenie_zawodowe",
  });
}

/** Podejrzewana choroba zawodowa (kod wg wykazu chorób zawodowych). */
export interface OccupationalDiseaseDiagnosis {
  /** Kod choroby zawodowej (system 11.1.16). */
  readonly code: string;
  readonly name: string;
  readonly description: string;
}

/**
 * Sekcja „Rozpoznanie choroby zawodowej" (.3.24): narracja + obowiązkowy wpis
 * observation (.4.12) z kodem choroby zawodowej (system 11.1.16).
 */
export function buildOccupationalDiseaseDiagnosisSection(
  diagnosis: OccupationalDiseaseDiagnosis,
): CdaSection {
  return {
    templateId: { "@root": OCCUPATIONAL_TEMPLATE.DIAGNOSIS_SECTION },
    code: {
      "@code": OCCUPATIONAL_LOINC.DIAGNOSIS,
      "@codeSystem": CDA_OID.LOINC,
      "@codeSystemName": "LOINC",
      "@displayName": "Diagnosis",
    },
    title: "Rozpoznanie choroby zawodowej",
    text: {
      content: { "@ID": "p1_rozpoznanie", "#": `${diagnosis.code} ${diagnosis.description}` },
    },
    entry: {
      "@typeCode": "COMP",
      templateId: { "@root": OCCUPATIONAL_TEMPLATE.DIAGNOSIS_ENTRY },
      observation: {
        "@classCode": "OBS",
        "@moodCode": "EVN",
        code: {
          "@code": diagnosis.code,
          "@codeSystem": OCCUPATIONAL_DISEASE_OID,
          "@codeSystemName": "Wykaz chorób zawodowych",
          "@displayName": diagnosis.name,
        },
        text: { reference: { "@value": "#p1_rozpoznanie" } },
      },
    },
  };
}

/**
 * Sekcja „Przedmiot skierowania" (.3.26): obowiązkowy wpis encounter (ENC/RQO, .4.13)
 * skierowany zawsze do poradni medycyny pracy (kod 1160).
 */
export function buildOccupationalDiseasePrescriptionsSection(): CdaSection {
  return {
    templateId: { "@root": OCCUPATIONAL_TEMPLATE.PRESCRIPTIONS_SECTION },
    code: {
      "@code": OCCUPATIONAL_LOINC.PRESCRIPTIONS,
      "@codeSystem": CDA_OID.LOINC,
      "@codeSystemName": "LOINC",
      "@displayName": "Prescriptions",
    },
    title: "Przedmiot skierowania",
    text: {
      content: {
        "@ID": "p1_przedmiot_skierowania",
        "#": `${OCCUPATIONAL_MEDICINE_CELL.code} ${OCCUPATIONAL_MEDICINE_CELL.name}`,
      },
    },
    entry: buildRequestedEncounterEntry(
      OCCUPATIONAL_TEMPLATE.REQUESTED_ENCOUNTER_ENTRY,
      { cellCode: OCCUPATIONAL_MEDICINE_CELL.code, cellName: OCCUPATIONAL_MEDICINE_CELL.name },
      "p1_przedmiot_skierowania",
    ),
  };
}
