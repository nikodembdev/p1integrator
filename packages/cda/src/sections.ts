import {
  BODY_SIDE,
  type BodySide,
  CDA_OID,
  CDA_TEMPLATE,
  CORRESPONDENCE_MODE,
  CORRESPONDENCE_OID,
  type CorrespondenceMode,
  LOINC_CODE,
  SNOMED_CODE,
} from "./constants.js";
import type { CdaSection } from "./types.js";

const loinc = (code: string, display: string): Record<string, unknown> => ({
  "@code": code,
  "@codeSystem": CDA_OID.LOINC,
  "@codeSystemName": "LOINC",
  "@displayName": display,
});

// ─────────────────────────────────────────────────────────────
// Wywiad społeczny (Social history)
// ─────────────────────────────────────────────────────────────

export function buildSocialHistorySection(schoolInfo: string): CdaSection {
  return {
    templateId: { "@root": CDA_TEMPLATE.SOCIAL_HISTORY_SECTION },
    code: loinc(LOINC_CODE.SOCIAL_HISTORY, "Social history"),
    text: { paragraph: { caption: "Rodzaj szkoły, klasa:", "#": schoolInfo } },
  };
}

// ─────────────────────────────────────────────────────────────
// Wywiad (Medical history)
// ─────────────────────────────────────────────────────────────

export interface ReferralMedicalHistory {
  readonly complaints?: string;
  readonly oncologicalTreatment?: string;
  readonly previousSpaTreatment?: string;
}

export function buildMedicalHistorySection(history: ReferralMedicalHistory): CdaSection {
  const labelled = (label: string, value: string): Record<string, unknown> => ({
    content: [{ "@styleCode": "Bold", "#": label }, { "#": value }],
  });
  const paragraphs: Record<string, unknown>[] = [];
  if (history.complaints) {
    paragraphs.push(
      labelled("Dolegliwości, przebieg choroby, dotychczasowe leczenie", history.complaints),
    );
  }
  if (history.oncologicalTreatment) {
    paragraphs.push(labelled("Leczenie onkologiczne:", history.oncologicalTreatment));
  }
  if (history.previousSpaTreatment) {
    paragraphs.push(
      labelled("Leczenie uzdrowiskowe w ostatnich 3 latach:", history.previousSpaTreatment),
    );
  }
  return {
    templateId: { "@root": CDA_TEMPLATE.MEDICAL_HISTORY_SECTION },
    code: loinc(LOINC_CODE.MEDICAL_HISTORY, "History of present illness"),
    title: "Wywiad",
    text: { paragraph: paragraphs },
  };
}

// ─────────────────────────────────────────────────────────────
// Rozpoznania (Diagnoses)
// ─────────────────────────────────────────────────────────────

export interface DiagnosisInput {
  readonly icd10Code: string;
  readonly icd10Name: string;
  /** Opis narracyjny rozpoznania (treść referencji z entry). */
  readonly description: string;
  readonly bodySide?: BodySide;
}

export interface ReferralDiagnoses {
  readonly main: DiagnosisInput;
  readonly secondary?: readonly DiagnosisInput[];
}

export function buildDiagnosesSection(diagnoses: ReferralDiagnoses): CdaSection {
  const all = [diagnoses.main, ...(diagnoses.secondary ?? [])];
  const contentId = (index: number): string => `OBS_${index + 1}`;

  return {
    templateId: { "@root": CDA_TEMPLATE.DIAGNOSES_SECTION },
    code: loinc(LOINC_CODE.DIAGNOSIS, "Diagnosis"),
    title: "Rozpoznania",
    text: {
      paragraph: {
        caption: "Rozpoznania wg ICD-10:",
        content: all.map((diagnosis, index) => ({
          "@ID": contentId(index),
          "#": `${diagnosis.icd10Code} ${diagnosis.description}`,
        })),
      },
    },
    entry: all.map((diagnosis, index) =>
      buildDiagnosisEntry(diagnosis, contentId(index), index === 0),
    ),
  };
}

function buildDiagnosisEntry(
  diagnosis: DiagnosisInput,
  contentId: string,
  isMain: boolean,
): Record<string, unknown> {
  const snomed = isMain ? SNOMED_CODE.PRINCIPAL_DIAGNOSIS : SNOMED_CODE.SECONDARY_DIAGNOSIS;
  const templateRoot = isMain
    ? CDA_TEMPLATE.MAIN_DIAGNOSIS_ENTRY
    : CDA_TEMPLATE.SECONDARY_DIAGNOSIS_ENTRY;

  const observation: Record<string, unknown> = {
    "@classCode": "OBS",
    "@moodCode": "EVN",
    code: {
      "@code": diagnosis.icd10Code,
      "@codeSystem": CDA_OID.ICD10,
      "@codeSystemName": "icd10",
      "@displayName": diagnosis.icd10Name,
    },
    text: { reference: { "@value": `#${contentId}` } },
  };
  if (diagnosis.bodySide) {
    const side = BODY_SIDE[diagnosis.bodySide];
    observation.targetSiteCode = {
      "@code": side.code,
      "@codeSystem": CDA_OID.SNOMED_CT,
      "@codeSystemName": "SNOMED CT",
      "@displayName": side.display,
    };
  }

  return {
    templateId: { "@root": templateRoot },
    organizer: {
      "@classCode": "BATTERY",
      "@moodCode": "EVN",
      code: {
        "@code": snomed.code,
        "@codeSystem": CDA_OID.SNOMED_CT,
        "@codeSystemName": "SNOMED CT",
        "@displayName": snomed.display,
      },
      statusCode: { "@code": "completed" },
      component: { observation },
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Korespondencja z pacjentem
// ─────────────────────────────────────────────────────────────

export function buildCorrespondenceSection(mode: CorrespondenceMode): CdaSection {
  const correspondence = CORRESPONDENCE_MODE[mode];
  return {
    templateId: { "@root": CDA_TEMPLATE.CORRESPONDENCE_SECTION },
    code: loinc(LOINC_CODE.CORRESPONDENCE, "Mode of communication"),
    title: "Korespondencja z pacjentem",
    text: {
      paragraph: {
        "@ID": "ACT_1",
        caption: "Sposób korespondencji z pacjentem:",
        content: correspondence.display,
      },
    },
    entry: {
      "@typeCode": "COMP",
      act: {
        "@classCode": "CONS",
        "@moodCode": "RQO",
        templateId: { "@root": CDA_TEMPLATE.CORRESPONDENCE_ACT_ENTRY },
        code: {
          "@code": correspondence.code,
          "@codeSystem": CORRESPONDENCE_OID,
          "@displayName": correspondence.display,
        },
        text: { reference: { "@value": "#ACT_1" } },
      },
    },
  };
}
