/**
 * Stałe HL7 CDA PL IG 1.3.2 dla dokumentów P1 (OID-y, szablony, systemy kodowania).
 * Wartości wprost ze specyfikacji P1 / wzorcowych dokumentów.
 */

export const CDA_OID = {
  PESEL: "2.16.840.1.113883.3.4424.1.1.616",
  NPWZ: "2.16.840.1.113883.3.4424.1.6.2",
  REGON_9: "2.16.840.1.113883.3.4424.2.2.1",
  REGON_14: "2.16.840.1.113883.3.4424.2.2.2",
  PROVIDER: "2.16.840.1.113883.3.4424.2.3.1",
  ORG_UNIT: "2.16.840.1.113883.3.4424.2.3.2",
  WORKPLACE: "2.16.840.1.113883.3.4424.2.3.3",
  NFZ_BRANCH: "2.16.840.1.113883.3.4424.3.1",
  NFZ_CONTRACT: "2.16.840.1.113883.3.4424.8.6.1.7",
  CSIOZ: "2.16.840.1.113883.3.4424",
  ICD10: "2.16.840.1.113883.6.3",
  ICD9_PL: "2.16.840.1.113883.3.4424.11.2.6",
  SNOMED_CT: "2.16.840.1.113883.6.96",
  LOINC: "2.16.840.1.113883.6.1",
  HL7_CONFIDENTIALITY: "2.16.840.1.113883.5.25",
  HL7_TYPE_ID: "2.16.840.1.113883.1.3",
  HL7_GENDER: "2.16.840.1.113883.5.1",
  SPECIALTY_CODES: "2.16.840.1.113883.3.4424.11.3.3.1",
  FUNCTION_CODES: "2.16.840.1.113883.3.4424.11.3.18",
  DOC_CLASS_P1: "2.16.840.1.113883.3.4424.11.1.32",
  POLISH_CLASSIFIERS: "2.16.840.1.113883.3.4424.13.5.1",
} as const;

export const CDA_TEMPLATE = {
  HEALTH_RESORT_REFERRAL: "2.16.840.1.113883.3.4424.13.10.1.9",
  PATIENT: "2.16.840.1.113883.3.4424.13.10.2.26",
  AUTHOR: "2.16.840.1.113883.3.4424.13.10.2.86",
  PERSON: "2.16.840.1.113883.3.4424.13.10.2.1",
  ORGANIZATION: "2.16.840.1.113883.3.4424.13.10.2.18",
  WHOLE_ORGANIZATION: "2.16.840.1.113883.3.4424.13.10.2.14",
  NFZ_CONTRACT: "2.16.840.1.113883.3.4424.13.10.2.44",
  NFZ_PARTICIPANT: "2.16.840.1.113883.3.4424.13.10.2.19",
  CUSTODIAN: "2.16.840.1.113883.3.4424.13.10.2.20",
  LEGAL_AUTHENTICATOR: "2.16.840.1.113883.3.4424.13.10.2.6",
  STRUCTURED_BODY: "2.16.840.1.113883.3.4424.13.10.2.35",

  // Sekcje body
  SOCIAL_HISTORY_SECTION: "2.16.840.1.113883.3.4424.13.10.3.9",
  MEDICAL_HISTORY_SECTION: "2.16.840.1.113883.3.4424.13.10.3.10",
  DIAGNOSES_SECTION: "2.16.840.1.113883.3.4424.13.10.3.1",
  CORRESPONDENCE_SECTION: "2.16.840.1.113883.3.4424.13.10.3.166",
  // Wpisy (entry)
  MAIN_DIAGNOSIS_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.1",
  SECONDARY_DIAGNOSIS_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.2",
  CORRESPONDENCE_ACT_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.174",
} as const;

export const LOINC_CODE = {
  REFERRAL: "57832-8",
  SOCIAL_HISTORY: "29762-2",
  MEDICAL_HISTORY: "10164-2",
  DIAGNOSIS: "29548-5",
  CORRESPONDENCE: "91878-9",
} as const;

/** Kody SNOMED CT używane w sekcji rozpoznań. */
export const SNOMED_CODE = {
  PRINCIPAL_DIAGNOSIS: { code: "8319008", display: "Principal diagnosis" },
  SECONDARY_DIAGNOSIS: { code: "85097005", display: "Secondary diagnosis" },
} as const;

/** Strona ciała (targetSiteCode, SNOMED CT). */
export const BODY_SIDE = {
  LEFT: { code: "7771000", display: "Left (qualifier value)" },
  RIGHT: { code: "24028007", display: "Right (qualifier value)" },
  BOTH: { code: "51440002", display: "Bilateral (qualifier value)" },
} as const;
export type BodySide = keyof typeof BODY_SIDE;

/** Sposób korespondencji z pacjentem. */
export const CORRESPONDENCE_MODE = {
  P: { code: "P", display: "KORESPONDENCJA DROGĄ PAPIEROWĄ" },
  E: { code: "E", display: "KORESPONDENCJA DROGĄ ELEKTRONICZNĄ" },
} as const;
export type CorrespondenceMode = keyof typeof CORRESPONDENCE_MODE;

export const CORRESPONDENCE_OID = "2.16.840.1.113883.3.4424.13.5.11";

/** Typ świadczenia uzdrowiskowego (qualifier RSUZDR). */
export const TREATMENT_TYPE = {
  LU: { code: "LU", display: "Leczenie uzdrowiskowe" },
  RU: { code: "RU", display: "Rehabilitacja uzdrowiskowa" },
} as const;
export type TreatmentType = keyof typeof TREATMENT_TYPE;

/** Tryb realizacji świadczenia uzdrowiskowego (qualifier TRSU). */
export const REALIZATION_MODE = {
  TS: { code: "TS", display: "Tryb stacjonarny" },
  TA: { code: "TA", display: "Tryb ambulatoryjny" },
} as const;
export type RealizationMode = keyof typeof REALIZATION_MODE;

export type Gender = "M" | "F" | "UN";
