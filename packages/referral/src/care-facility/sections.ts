import { CDA_OID, type CdaSection } from "@p1/cda";
import {
  buildNarrativeSection,
  buildRequestedEncounterEntry,
  type RequestedEncounter,
} from "../common/index.js";
import { CARE_FACILITY_LOINC, CARE_FACILITY_TEMPLATE } from "./constants.js";

/** Sekcja narracyjna „Dotychczasowe leczenie" (.3.13, tytuł wymagany). */
export function buildCurrentMedicationSection(text: string): CdaSection {
  return buildNarrativeSection({
    templateId: CARE_FACILITY_TEMPLATE.CURRENT_MEDICATION_SECTION,
    loincCode: CARE_FACILITY_LOINC.CURRENT_MEDICATION,
    loincDisplay: "Medication current",
    title: "Dotychczasowe leczenie",
    text,
    contentId: "p1_dotychczasowe_leczenie",
  });
}

/** Sekcja narracyjna „Skala Barthel" (.3.14). */
export function buildBarthelScoreSection(text: string): CdaSection {
  return buildNarrativeSection({
    templateId: CARE_FACILITY_TEMPLATE.BARTHEL_SECTION,
    loincCode: CARE_FACILITY_LOINC.BARTHEL,
    loincDisplay: "History of functional status",
    title: "Skala Barthel",
    text,
    contentId: "p1_skala_barthel",
  });
}

/** Sekcja narracyjna „Uwagi" (.3.2, Annotation comment). */
export function buildAnnotationCommentSection(text: string): CdaSection {
  return buildNarrativeSection({
    templateId: CARE_FACILITY_TEMPLATE.ANNOTATION_COMMENT_SECTION,
    loincCode: CARE_FACILITY_LOINC.ANNOTATION_COMMENT,
    loincDisplay: "Annotation comment",
    title: "Uwagi",
    text,
    contentId: "p1_uwagi",
  });
}

/**
 * Sekcja „Przedmiot skierowania" (.3.15): obowiązkowy wpis encounter (ENC/RQO, .4.9)
 * z kodem specjalności komórki zakładu opiekuńczego.
 */
export function buildCareFacilityPrescriptionsSection(encounter: RequestedEncounter): CdaSection {
  return {
    templateId: { "@root": CARE_FACILITY_TEMPLATE.PRESCRIPTIONS_SECTION },
    code: {
      "@code": CARE_FACILITY_LOINC.PRESCRIPTIONS,
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
      CARE_FACILITY_TEMPLATE.REQUESTED_ENCOUNTER_ENTRY,
      encounter,
      "p1_przedmiot_skierowania",
    ),
  };
}
