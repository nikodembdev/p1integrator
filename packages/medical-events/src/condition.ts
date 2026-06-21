/**
 * Builder zasobu FHIR Condition (rozpoznanie) dla Zdarzenia Medycznego
 * (profil PLMedicalEventDiagnosis). W zdarzeniu wymagane jest co najmniej jedno
 * rozpoznanie (REG.WER.10857).
 */

export const ZM_CONDITION_SYSTEM = {
  PROFILE_DIAGNOSIS: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLMedicalEventDiagnosis",
  CONFIDENTIALITY: "urn:oid:2.16.840.1.113883.3.4424.11.1.83",
  LOCATION_EXTENSION: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLLocation",
  CELL: "urn:oid:2.16.840.1.113883.3.4424.2.3.3",
  DIAGNOSIS_CATEGORY: "urn:oid:2.16.840.1.113883.3.4424.11.1.78",
  ICD10: "urn:oid:2.16.840.1.113883.6.3",
  BODY_SITE: "urn:oid:2.16.840.1.113883.3.4424.11.1.79",
  PESEL: "urn:oid:2.16.840.1.113883.3.4424.1.1.616",
  NPWZ: "urn:oid:2.16.840.1.113883.3.4424.1.6.2",
  PROFESSION_ROLE: "urn:oid:2.16.840.1.113883.3.4424.11.1.80",
  FUNCTION_EXTENSION: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLFunction",
} as const;

export interface MedicalEventConditionInput {
  /** Pacjent: referencja (Patient/{id}) + PESEL. */
  patient: { reference: string; pesel: string };
  /** Zdarzenie: referencja (Encounter/{id}). */
  encounter: { reference: string };
  /** Komórka organizacyjna (identyfikator {podmiot}-{res7}). */
  location: { identifier: string };
  /** Kategoria rozpoznania (domyślnie główne). */
  category?: { code: string; display: string };
  /** Rozpoznanie ICD-10. */
  diagnosis: { code: string; display: string };
  /** Data rozpoznania (YYYY-MM-DD). */
  recordedDate: string;
  /** Rozpoznający: NPWZ + dane + rola. */
  asserter: { npwz: string; display: string; functionCode: string };
  /** Strona ciała (opcjonalnie). */
  bodySite?: { code: string; display: string };
  confidentialityCode?: string;
}

type Json = Record<string, unknown>;

/** Buduje zasób FHIR Condition (PLMedicalEventDiagnosis). */
export function buildMedicalEventCondition(input: MedicalEventConditionInput): Json {
  const category = input.category ?? { code: "main", display: "Główne" };
  const condition: Json = {
    resourceType: "Condition",
    meta: {
      profile: [ZM_CONDITION_SYSTEM.PROFILE_DIAGNOSIS],
      security: [
        { system: ZM_CONDITION_SYSTEM.CONFIDENTIALITY, code: input.confidentialityCode ?? "N" },
      ],
    },
    extension: [
      {
        url: ZM_CONDITION_SYSTEM.LOCATION_EXTENSION,
        valueIdentifier: { system: ZM_CONDITION_SYSTEM.CELL, value: input.location.identifier },
      },
    ],
    category: [
      {
        coding: [
          {
            system: ZM_CONDITION_SYSTEM.DIAGNOSIS_CATEGORY,
            code: category.code,
            display: category.display,
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: ZM_CONDITION_SYSTEM.ICD10,
          code: input.diagnosis.code,
          display: input.diagnosis.display,
        },
      ],
    },
    subject: {
      reference: input.patient.reference,
      type: "Patient",
      identifier: { system: ZM_CONDITION_SYSTEM.PESEL, value: input.patient.pesel },
    },
    encounter: { reference: input.encounter.reference, type: "Encounter" },
    recordedDate: input.recordedDate,
    asserter: {
      extension: [
        {
          url: ZM_CONDITION_SYSTEM.FUNCTION_EXTENSION,
          valueCoding: {
            system: ZM_CONDITION_SYSTEM.PROFESSION_ROLE,
            code: input.asserter.functionCode,
          },
        },
      ],
      identifier: { system: ZM_CONDITION_SYSTEM.NPWZ, value: input.asserter.npwz },
      display: input.asserter.display,
    },
  };
  if (input.bodySite) {
    condition["bodySite"] = [
      {
        coding: [
          {
            system: ZM_CONDITION_SYSTEM.BODY_SITE,
            code: input.bodySite.code,
            display: input.bodySite.display,
          },
        ],
      },
    ];
  }
  return condition;
}
