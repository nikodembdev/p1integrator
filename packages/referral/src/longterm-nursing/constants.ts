/**
 * Stałe skierowania do pielęgniarskiej opieki długoterminowej
 * (plCdaReferralToLongtermNursing, CDA PL IG 1.3.2).
 */

export const LONGTERM_NURSING_TEMPLATE = {
  LONGTERM_NURSING_REFERRAL: "2.16.840.1.113883.3.4424.13.10.1.11",
  STRUCTURED_BODY: "2.16.840.1.113883.3.4424.13.10.2.39",
  RECORD_TARGET: "2.16.840.1.113883.3.4424.13.10.2.38",
  HISTORY_SECTION: "2.16.840.1.113883.3.4424.13.10.3.10",
  PHYSICAL_FINDINGS_SECTION: "2.16.840.1.113883.3.4424.13.10.3.11",
  PRESCRIPTIONS_SECTION: "2.16.840.1.113883.3.4424.13.10.3.16",
  REQUESTED_ENCOUNTER_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.10",
} as const;

export const LONGTERM_NURSING_LOINC = {
  HISTORY: "10164-2",
  PHYSICAL_FINDINGS: "29545-1",
  PRESCRIPTIONS: "57828-6",
} as const;

/** Kod dokumentu i klasyfikacja P1 (jak skierowanie do zakładu opiekuńczego). */
export const LONGTERM_NURSING_DOC = {
  LOINC: "34140-4",
  LOINC_DISPLAY: "Transfer of care referral note",
  P1_CLASS: "02.12",
  P1_CLASS_DISPLAY: "Prośba o objęcie opieką",
} as const;
