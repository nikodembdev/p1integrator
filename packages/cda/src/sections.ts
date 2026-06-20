import {
  BODY_SIDE,
  type BodySide,
  CDA_OID,
  CDA_TEMPLATE,
  CORRESPONDENCE_MODE,
  CORRESPONDENCE_OID,
  type CorrespondenceMode,
  JUSTIFICATION_CODE,
  type JustificationCode,
  JUSTIFICATION_OID,
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

// ─────────────────────────────────────────────────────────────
// Badanie przedmiotowe (Physical findings)
// ─────────────────────────────────────────────────────────────

export interface VitalSigns {
  readonly systolicBP: number;
  readonly diastolicBP: number;
  readonly weight: number;
  readonly height: number;
  readonly heartRate: number;
}

export interface SystemsExam {
  readonly skinLymphNodes?: string;
  readonly respiratory?: string;
  readonly cardiovascular?: string;
  readonly digestive?: string;
  readonly urogenital?: string;
  readonly musculoskeletal?: string;
  readonly mobilityStatus?: string;
  readonly nervousSystem?: string;
}

export interface PhysicalExam {
  readonly vitalSigns: VitalSigns;
  readonly systems?: SystemsExam;
  readonly selfCareAbility: boolean;
  readonly contraindicationsForNaturalResources: boolean;
  readonly justifications: readonly JustificationCode[];
}

interface VitalConfig {
  readonly key: keyof VitalSigns;
  readonly template: string;
  readonly loinc: string;
  readonly display: string;
  readonly unit: string;
  readonly ref: string;
  readonly label: string;
}

const VITALS: readonly VitalConfig[] = [
  {
    key: "systolicBP",
    template: CDA_TEMPLATE.SYSTOLIC_BP_ENTRY,
    loinc: "8480-6",
    display: "Systolic blood pressure",
    unit: "mm[Hg]",
    ref: "OBS_BP_CTS",
    label: "Ciśnienie tętnicze skurczowe",
  },
  {
    key: "diastolicBP",
    template: CDA_TEMPLATE.DIASTOLIC_BP_ENTRY,
    loinc: "8462-4",
    display: "Diastolic blood pressure",
    unit: "mm[Hg]",
    ref: "OBS_BP_CTR",
    label: "Ciśnienie tętnicze rozkurczowe",
  },
  {
    key: "weight",
    template: CDA_TEMPLATE.BODY_WEIGHT_ENTRY,
    loinc: "29463-7",
    display: "Body weight",
    unit: "kg",
    ref: "OBS_BP_MC",
    label: "Masa ciała",
  },
  {
    key: "height",
    template: CDA_TEMPLATE.BODY_HEIGHT_ENTRY,
    loinc: "8302-2",
    display: "Body height",
    unit: "cm",
    ref: "OBS_BP_WZ",
    label: "Wzrost",
  },
  {
    key: "heartRate",
    template: CDA_TEMPLATE.HEART_RATE_ENTRY,
    loinc: "8867-4",
    display: "Heart rate",
    unit: "/min",
    ref: "OBS_BP_TE",
    label: "Tętno",
  },
];

const SYSTEM_ROWS: readonly { readonly key: keyof SystemsExam; readonly label: string }[] = [
  { key: "skinLymphNodes", label: "Skóra, węzły chłonne" },
  { key: "respiratory", label: "Układ oddechowy [OCW]" },
  { key: "cardiovascular", label: "Układ krążenia [OCW] NYHA" },
  { key: "digestive", label: "Układ trawienny" },
  { key: "urogenital", label: "Układ moczopłciowy [OCW] nerek" },
  { key: "musculoskeletal", label: "Układ ruchu" },
  { key: "mobilityStatus", label: "Sprawność ruchowa" },
  { key: "nervousSystem", label: "Układ nerwowy narządów zmysłów" },
];

const yesNo = (value: boolean): string => (value ? "TAK" : "NIE");

export function buildPhysicalExamSection(exam: PhysicalExam): CdaSection {
  const rows: Record<string, unknown>[] = [];
  for (const vital of VITALS) {
    rows.push({
      "@ID": vital.ref,
      td: [{ "#": vital.label }, { "#": `${exam.vitalSigns[vital.key]} ${vital.unit}` }],
    });
  }
  for (const system of SYSTEM_ROWS) {
    const value = exam.systems?.[system.key];
    if (value) rows.push({ td: [{ "#": system.label }, { "#": value }] });
  }
  rows.push({ td: [{ "#": "Zdolność samoobsługi" }, { "#": yesNo(exam.selfCareAbility) }] });
  rows.push({
    td: [
      { "#": "Przeciwskazania na surowce lecznicze" },
      { "#": yesNo(exam.contraindicationsForNaturalResources) },
    ],
  });
  rows.push({
    td: [
      { "#": "Uzasadnienie" },
      {
        content: exam.justifications.map((code, index) => ({
          "@ID": `JUST_${index + 1}`,
          "#": JUSTIFICATION_CODE[code],
        })),
      },
    ],
  });

  const vitalEntries = VITALS.map((vital) => ({
    "@typeCode": "COMP",
    observation: {
      "@classCode": "OBS",
      "@moodCode": "EVN",
      templateId: { "@root": vital.template },
      code: loinc(vital.loinc, vital.display),
      text: { reference: { "@value": `#${vital.ref}` } },
      value: {
        "@unit": vital.unit,
        "@value": String(exam.vitalSigns[vital.key]),
        "@xsi:type": "PQ",
      },
    },
  }));

  const justificationEntry = {
    templateId: { "@root": CDA_TEMPLATE.JUSTIFICATION_ORGANIZER_ENTRY },
    organizer: {
      "@classCode": "BATTERY",
      "@moodCode": "EVN",
      code: loinc(LOINC_CODE.REASON_FOR_REFERRAL, "Reason for referral (narrative)"),
      statusCode: { "@code": "completed" },
      component: exam.justifications.map((code, index) => ({
        observation: {
          "@classCode": "OBS",
          "@moodCode": "EVN",
          code: {
            "@code": code,
            "@codeSystem": JUSTIFICATION_OID,
            "@displayName": JUSTIFICATION_CODE[code],
          },
          text: { reference: { "@value": `#JUST_${index + 1}` } },
        },
      })),
    },
  };

  return {
    templateId: { "@root": CDA_TEMPLATE.PHYSICAL_EXAM_SECTION },
    code: loinc(LOINC_CODE.PHYSICAL_FINDINGS, "Physical findings"),
    title: "Badanie przedmiotowe",
    text: { table: { tbody: { tr: rows } } },
    entry: [...vitalEntries, justificationEntry],
  };
}

// ─────────────────────────────────────────────────────────────
// Aktualne wyniki badań (Lab results, ICD-9-PL)
// ─────────────────────────────────────────────────────────────

export interface LabResult {
  readonly icd9Code: string;
  readonly icd9Name: string;
  readonly date: string; // YYYYMMDD
  readonly description?: string;
}

export function buildLabResultsSection(results: readonly LabResult[]): CdaSection {
  const refId = (index: number): string => `OBS_WB_${index + 1}`;
  return {
    templateId: { "@root": CDA_TEMPLATE.LAB_RESULTS_SECTION },
    code: loinc(LOINC_CODE.LAB_DATA, "Relevant diagnostic tests/laboratory data"),
    title: "Aktualne wyniki badań",
    text: {
      paragraph: results.map((result, index) => ({
        "@ID": refId(index),
        "#": `${result.date}; ${result.icd9Code} ${result.icd9Name}${result.description ? ` - ${result.description}` : ""}`,
      })),
    },
    entry: results.map((result, index) => ({
      "@typeCode": "COMP",
      observation: {
        "@classCode": "OBS",
        "@moodCode": "EVN",
        templateId: { "@root": CDA_TEMPLATE.LAB_OBSERVATION_ENTRY },
        code: {
          "@code": result.icd9Code,
          "@codeSystem": CDA_OID.ICD9_PL,
          "@codeSystemName": "ICD-9-PL",
          "@displayName": result.icd9Name,
        },
        text: { reference: { "@value": `#${refId(index)}` } },
        effectiveTime: { "@value": result.date },
      },
    })),
  };
}
