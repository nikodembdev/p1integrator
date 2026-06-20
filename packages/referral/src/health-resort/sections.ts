import { CDA_OID, type CdaSection } from "@p1/cda";
import {
  CORRESPONDENCE_MODE,
  CORRESPONDENCE_OID,
  type CorrespondenceMode,
  JUSTIFICATION_CODE,
  type JustificationCode,
  JUSTIFICATION_OID,
  LOINC_CODE,
  REFERRAL_TEMPLATE,
} from "./constants.js";

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
    templateId: { "@root": REFERRAL_TEMPLATE.SOCIAL_HISTORY_SECTION },
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

/** Blok narracyjny wywiadu: opcjonalne ID paragrafu + content opis (Bold) + content wartość. */
function historyBlock(
  paragraphId: string | undefined,
  opisId: string,
  opis: string,
  wartoscId: string,
  wartosc: string,
): Record<string, unknown> {
  const paragraph: Record<string, unknown> = {};
  if (paragraphId) paragraph["@ID"] = paragraphId;
  paragraph.content = [
    { "@ID": opisId, "@styleCode": "Bold", "#": opis },
    { "@ID": wartoscId, "#": wartosc },
  ];
  return paragraph;
}

export function buildMedicalHistorySection(history: ReferralMedicalHistory): CdaSection {
  return {
    templateId: { "@root": REFERRAL_TEMPLATE.MEDICAL_HISTORY_SECTION },
    code: loinc(LOINC_CODE.MEDICAL_HISTORY, "History of present illness"),
    title: "Wywiad",
    text: {
      paragraph: [
        historyBlock(
          "p1_wywiad",
          "p1_wywiad_opis",
          "Dolegliwości, przebieg choroby, dotychczasowe leczenie",
          "p1_wywiad_wartosc",
          history.complaints ?? "",
        ),
        historyBlock(
          undefined,
          "p1_wywiad_leczenie_onkologiczne_opis",
          "Leczenie onkologiczne:",
          "p1_wywiad_leczenie_onkologiczne",
          history.oncologicalTreatment ?? "NIE",
        ),
        historyBlock(
          undefined,
          "p1_wywiad_leczenie_uzdrowiskowe_3_lat_opis",
          "Leczenie uzdrowiskowe w ostatnich 3 latach:",
          "p1_wywiad_leczenie_uzdrowiskowe_3_lat",
          history.previousSpaTreatment ?? "NIE",
        ),
      ],
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Korespondencja z pacjentem
// ─────────────────────────────────────────────────────────────

export function buildCorrespondenceSection(mode: CorrespondenceMode): CdaSection {
  const correspondence = CORRESPONDENCE_MODE[mode];
  return {
    templateId: { "@root": REFERRAL_TEMPLATE.CORRESPONDENCE_SECTION },
    code: loinc(LOINC_CODE.CORRESPONDENCE, "Mode of communication"),
    title: "Korespondencja z pacjentem",
    text: {
      paragraph: {
        "@ID": "ACT_1",
        caption: { "@ID": "p1_sk_opis", "#": "Sposób korespondencji z pacjentem:" },
        content: { "@ID": "p1_sk_wartosc", "#": correspondence.display },
      },
    },
    entry: {
      "@typeCode": "COMP",
      act: {
        "@classCode": "CONS",
        "@moodCode": "RQO",
        templateId: { "@root": REFERRAL_TEMPLATE.CORRESPONDENCE_ACT_ENTRY },
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
  readonly opisId: string;
  readonly wartoscId: string;
  readonly label: string;
}

const VITALS: readonly VitalConfig[] = [
  {
    key: "systolicBP",
    template: REFERRAL_TEMPLATE.SYSTOLIC_BP_ENTRY,
    loinc: "8480-6",
    display: "Systolic blood pressure",
    unit: "mm[Hg]",
    ref: "OBS_BP_CTS",
    opisId: "p1_skieruzdro_bp_cts_opis",
    wartoscId: "p1_skieruzdro_bp_cts_wartosc",
    label: "Ciśnienie tętnicze skurczowe",
  },
  {
    key: "diastolicBP",
    template: REFERRAL_TEMPLATE.DIASTOLIC_BP_ENTRY,
    loinc: "8462-4",
    display: "Diastolic blood pressure",
    unit: "mm[Hg]",
    ref: "OBS_BP_CTR",
    opisId: "p1_skieruzdro_bp_ctr_opis",
    wartoscId: "p1_skieruzdro_bp_ctr_wartosc",
    label: "Ciśnienie tętnicze rozkurczowe",
  },
  {
    key: "weight",
    template: REFERRAL_TEMPLATE.BODY_WEIGHT_ENTRY,
    loinc: "29463-7",
    display: "Body weight",
    unit: "kg",
    ref: "OBS_BP_MC",
    opisId: "p1_skieruzdro_bp_mc_opis",
    wartoscId: "p1_skieruzdro_bp_mc_wartosc",
    label: "Masa ciała",
  },
  {
    key: "height",
    template: REFERRAL_TEMPLATE.BODY_HEIGHT_ENTRY,
    loinc: "8302-2",
    display: "Body height",
    unit: "cm",
    ref: "OBS_BP_WZ",
    opisId: "p1_skieruzdro_bp_wz_opis",
    wartoscId: "p1_skieruzdro_bp_wz_wartosc",
    label: "Wzrost",
  },
  {
    key: "heartRate",
    template: REFERRAL_TEMPLATE.HEART_RATE_ENTRY,
    loinc: "8867-4",
    display: "Heart rate",
    unit: "/min",
    ref: "OBS_BP_TE",
    opisId: "p1_skieruzdro_bp_te_opis",
    wartoscId: "p1_skieruzdro_bp_te_wartosc",
    label: "Tętno",
  },
];

interface SystemRow {
  readonly key: keyof SystemsExam;
  readonly opisId: string;
  readonly wartoscId: string;
  readonly label: string;
}

const SYSTEM_ROWS: readonly SystemRow[] = [
  {
    key: "skinLymphNodes",
    opisId: "p1_skieruzdro_bp_skora_wezly_chlonne_opis",
    wartoscId: "p1_skieruzdro_bp_skora_wezly_chlonne_wartosc",
    label: "Skóra, węzły chłonne",
  },
  {
    key: "respiratory",
    opisId: "p1_skieruzdro_bp_uklad_oddechowy_ocw_opis",
    wartoscId: "p1_skieruzdro_bp_uklad_oddechowy_ocw_wartosc",
    label: "Układ oddechowy [OCW]",
  },
  {
    key: "cardiovascular",
    opisId: "p1_skieruzdro_bp_uklad_krazenia_ocw_nyha_opis",
    wartoscId: "p1_skieruzdro_bp_uklad_krazenia_ocw_nyha_wartosc",
    label: "Układ krążenia [OCW] NYHA",
  },
  {
    key: "digestive",
    opisId: "p1_skieruzdro_bp_uklad_trawienny_opis",
    wartoscId: "p1_skieruzdro_bp_uklad_trawienny_wartosc",
    label: "Układ trawienny",
  },
  {
    key: "urogenital",
    opisId: "p1_skieruzdro_bp_uklad_moczoplciowy_ocw_nerek_opis",
    wartoscId: "p1_skieruzdro_bp_uklad_moczoplciowy_ocw_nerek_wartosc",
    label: "Układ moczopłciowy [OCW] nerek",
  },
  {
    key: "musculoskeletal",
    opisId: "p1_skieruzdro_bp_uklad_ruchu_opis",
    wartoscId: "p1_skieruzdro_bp_uklad_ruchu_wartosc",
    label: "Układ ruchu",
  },
];

const yesNo = (value: boolean): string => (value ? "TAK" : "NIE");

function examRow(
  opisId: string,
  label: string,
  wartoscId: string,
  value: string,
  trId?: string,
): Record<string, unknown> {
  const tr: Record<string, unknown> = {};
  if (trId) tr["@ID"] = trId;
  tr.td = [
    { "@ID": opisId, "#": label },
    { "@ID": wartoscId, "#": value },
  ];
  return tr;
}

export function buildPhysicalExamSection(exam: PhysicalExam): CdaSection {
  const systems = exam.systems ?? {};
  const vitalRows: Record<string, unknown>[] = [];
  for (const vital of VITALS) {
    vitalRows.push(
      examRow(
        vital.opisId,
        vital.label,
        vital.wartoscId,
        `${exam.vitalSigns[vital.key]} ${vital.unit}`,
        vital.ref,
      ),
    );
  }

  const systemRows: Record<string, unknown>[] = [];
  for (const system of SYSTEM_ROWS) {
    systemRows.push(
      examRow(system.opisId, system.label, system.wartoscId, systems[system.key] ?? ""),
    );
  }
  systemRows.push(
    examRow(
      "p1_skieruzdro_bp_zdolnosc_samoobslugi_opis",
      "Zdolność samoobsługi",
      "p1_skieruzdro_bp_zdolnosc_samoobslugi_wartosc",
      yesNo(exam.selfCareAbility),
    ),
    examRow(
      "p1_skieruzdro_bp_ocena_sprawnosc_ruchowa_opis",
      "Sprawność ruchowa",
      "p1_skieruzdro_bp_ocena_sprawnosc_ruchowa_wartosc",
      systems.mobilityStatus ?? "",
    ),
    examRow(
      "p1_skieruzdro_bp_uklad_nerwowy_narzady_zmyslow_opis",
      "Układ nerwowy narządów zmysłów",
      "p1_skieruzdro_bp_uklad_nerwowy_narzady_zmyslow_wartosc",
      systems.nervousSystem ?? "",
    ),
    examRow(
      "p1_skieruzdro_bp_przeciwskazania_nat_surowce_lecznicze_opis",
      "Przeciwskazania na surowce lecznicze",
      "p1_skieruzdro_bp_przeciwskazania_nat_surowce_lecznicze_wartosc",
      yesNo(exam.contraindicationsForNaturalResources),
    ),
  );
  systemRows.push({
    td: [
      { "@ID": "p1_skieruzdro_bp_uzasadnienie_opis", "#": "Uzasadnienie" },
      {
        content: exam.justifications.map((code, index) => ({
          "@ID": `p1_skieruzdro_bp_uzasadnienie_wartosc_${index + 1}`,
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
    templateId: { "@root": REFERRAL_TEMPLATE.JUSTIFICATION_ORGANIZER_ENTRY },
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
          text: {
            reference: { "@value": `#p1_skieruzdro_bp_uzasadnienie_wartosc_${index + 1}` },
          },
        },
      })),
    },
  };

  return {
    templateId: { "@root": REFERRAL_TEMPLATE.PHYSICAL_EXAM_SECTION },
    code: loinc(LOINC_CODE.PHYSICAL_FINDINGS, "Physical findings"),
    title: "Badanie przedmiotowe",
    text: {
      table: [{ tbody: { tr: vitalRows } }, { tbody: { tr: systemRows } }],
    },
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
    templateId: { "@root": REFERRAL_TEMPLATE.LAB_RESULTS_SECTION },
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
        templateId: { "@root": REFERRAL_TEMPLATE.LAB_OBSERVATION_ENTRY },
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

// ─────────────────────────────────────────────────────────────
// Leczenie ambulatoryjne (tylko tryb TA)
// ─────────────────────────────────────────────────────────────

export interface AmbulatoryTreatment {
  readonly location: string;
  readonly term?: string;
}

export function buildAmbulatoryTreatmentSection(treatment: AmbulatoryTreatment): CdaSection {
  const term = treatment.term ? `, termin: ${treatment.term}` : "";
  return {
    templateId: { "@root": REFERRAL_TEMPLATE.AMBULATORY_TREATMENT_SECTION },
    code: loinc(LOINC_CODE.ANNOTATION_COMMENT, "Annotation comment"),
    title: "Leczenie Ambulatoryjne",
    text: {
      paragraph: {
        "@ID": "p1_la_miejsce",
        caption: { "@styleCode": "Bold", "#": "Preferowane miejsce leczenia ambulatoryjnego:" },
        "#": `${treatment.location}${term}`,
      },
    },
  };
}
