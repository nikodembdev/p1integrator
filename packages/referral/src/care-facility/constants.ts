/**
 * Stałe skierowania do zakładu opiekuńczego (pielęgnacyjno-opiekuńczego /
 * opiekuńczo-leczniczego) - plCdaReferralToCareFacility, CDA PL IG 1.3.2.
 */

export const CARE_FACILITY_TEMPLATE = {
  CARE_FACILITY_REFERRAL: "2.16.840.1.113883.3.4424.13.10.1.10",
  STRUCTURED_BODY: "2.16.840.1.113883.3.4424.13.10.2.37",
  /** recordTarget zakładu opiekuńczego (bez birthplace, inny templateId niż domyślny). */
  RECORD_TARGET: "2.16.840.1.113883.3.4424.13.10.2.36",
  CURRENT_MEDICATION_SECTION: "2.16.840.1.113883.3.4424.13.10.3.13",
  BARTHEL_SECTION: "2.16.840.1.113883.3.4424.13.10.3.14",
  PRESCRIPTIONS_SECTION: "2.16.840.1.113883.3.4424.13.10.3.15",
  ANNOTATION_COMMENT_SECTION: "2.16.840.1.113883.3.4424.13.10.3.2",
  REQUESTED_ENCOUNTER_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.9",
} as const;

export const CARE_FACILITY_LOINC = {
  CURRENT_MEDICATION: "19009-0",
  BARTHEL: "10158-4",
  PRESCRIPTIONS: "57828-6",
  ANNOTATION_COMMENT: "48767-8",
} as const;

/** Kod dokumentu i klasyfikacja P1 (inne niż skierowanie ogólne). */
export const CARE_FACILITY_DOC = {
  /** LOINC „Transfer of care referral note". */
  LOINC: "34140-4",
  LOINC_DISPLAY: "Transfer of care referral note",
  /** KLAS_DOK_P1: „Prośba o objęcie opieką". */
  P1_CLASS: "02.12",
  P1_CLASS_DISPLAY: "Prośba o objęcie opieką",
} as const;
