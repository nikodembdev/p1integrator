import { CDA_OID, type CdaSection } from "@p1/cda";
import {
  buildNarrativeSection,
  buildRequestedEncounterEntry,
  type RequestedEncounter,
} from "../common/index.js";
import { LONGTERM_NURSING_LOINC, LONGTERM_NURSING_TEMPLATE } from "./constants.js";

/** Sekcja narracyjna „Wywiad" (.3.10). */
export function buildLongtermNursingHistorySection(text: string): CdaSection {
  return buildNarrativeSection({
    templateId: LONGTERM_NURSING_TEMPLATE.HISTORY_SECTION,
    loincCode: LONGTERM_NURSING_LOINC.HISTORY,
    loincDisplay: "History of present illness",
    title: "Wywiad",
    text,
    contentId: "p1_wywiad",
  });
}

/** Sekcja narracyjna „Badanie przedmiotowe" (.3.11). */
export function buildLongtermNursingPhysicalFindingsSection(text: string): CdaSection {
  return buildNarrativeSection({
    templateId: LONGTERM_NURSING_TEMPLATE.PHYSICAL_FINDINGS_SECTION,
    loincCode: LONGTERM_NURSING_LOINC.PHYSICAL_FINDINGS,
    loincDisplay: "Physical findings",
    title: "Badanie przedmiotowe",
    text,
    contentId: "p1_badanie",
  });
}

/**
 * Sekcja „Przedmiot skierowania" (.3.16): obowiązkowy wpis encounter (ENC/RQO, .4.10)
 * z kodem specjalności komórki pielęgniarskiej opieki długoterminowej.
 */
export function buildLongtermNursingPrescriptionsSection(
  encounter: RequestedEncounter,
): CdaSection {
  return {
    templateId: { "@root": LONGTERM_NURSING_TEMPLATE.PRESCRIPTIONS_SECTION },
    code: {
      "@code": LONGTERM_NURSING_LOINC.PRESCRIPTIONS,
      "@codeSystem": CDA_OID.LOINC,
      "@codeSystemName": "LOINC",
      "@displayName": "Prescriptions",
    },
    title: "Zalecenia lekarskie",
    text: {
      content: {
        "@ID": "p1_przedmiot_skierowania",
        "#": `${encounter.cellCode} ${encounter.cellName}`,
      },
    },
    entry: buildRequestedEncounterEntry(
      LONGTERM_NURSING_TEMPLATE.REQUESTED_ENCOUNTER_ENTRY,
      encounter,
      "p1_przedmiot_skierowania",
    ),
  };
}
