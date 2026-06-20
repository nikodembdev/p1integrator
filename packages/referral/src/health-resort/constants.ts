/**
 * Stałe specyficzne dla skierowania na leczenie uzdrowiskowe (CDA PL IG 1.3.2).
 * Sekcje wspólne (rozpoznania, załączniki) i ich stałe są w `../common`.
 */

export const REFERRAL_TEMPLATE = {
  HEALTH_RESORT_REFERRAL: "2.16.840.1.113883.3.4424.13.10.1.9",
  SOCIAL_HISTORY_SECTION: "2.16.840.1.113883.3.4424.13.10.3.9",
  MEDICAL_HISTORY_SECTION: "2.16.840.1.113883.3.4424.13.10.3.10",
  PHYSICAL_EXAM_SECTION: "2.16.840.1.113883.3.4424.13.10.3.11",
  LAB_RESULTS_SECTION: "2.16.840.1.113883.3.4424.13.10.3.7",
  CORRESPONDENCE_SECTION: "2.16.840.1.113883.3.4424.13.10.3.166",
  AMBULATORY_TREATMENT_SECTION: "2.16.840.1.113883.3.4424.13.10.3.2",
  CORRESPONDENCE_ACT_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.174",
  SYSTOLIC_BP_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.169",
  DIASTOLIC_BP_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.170",
  BODY_WEIGHT_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.171",
  BODY_HEIGHT_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.172",
  HEART_RATE_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.173",
  JUSTIFICATION_ORGANIZER_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.237",
  LAB_OBSERVATION_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.20",
} as const;

export const LOINC_CODE = {
  REFERRAL: "57832-8",
  SOCIAL_HISTORY: "29762-2",
  MEDICAL_HISTORY: "10164-2",
  PHYSICAL_FINDINGS: "29545-1",
  LAB_DATA: "30954-2",
  CORRESPONDENCE: "91878-9",
  REASON_FOR_REFERRAL: "42349-1",
  ANNOTATION_COMMENT: "48767-8",
} as const;

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

export const JUSTIFICATION_OID = "2.16.840.1.113883.3.4424.11.1.300";

/** Uzasadnienia świadczenia uzdrowiskowego (kody wprost z P1). */
export const JUSTIFICATION_CODE = {
  ULA: "Uzupełnienie leczenia ambulatoryjnego",
  KLS: "Kontynuacja leczenia szpitalnego/rekonwalescencja poszpitalna",
  KRS: "Kontynuacja rehabilitacji szpitalnej",
  PJZ: "Poprawa jakości życia",
  PSR: "Poprawa sprawności ruchowej",
  PWK: "Poprawa wydolności krążeniowej/zmniejszenie ryzyka sercowo-naczyniowego",
  PWO: "Poprawa wydolności oddechowej",
  LPB: "Leczenie przeciwbólowe",
  LPO: "Leczenie przeciwobrzękowe",
  PPO: "Profilaktyka powikłań odległych",
  LDI: "Leczenie dietetyczne",
  RWA: "Redukcja wagi",
  EZD: "Edukacja zdrowotna",
  INN: "Inna",
} as const;
export type JustificationCode = keyof typeof JUSTIFICATION_CODE;
