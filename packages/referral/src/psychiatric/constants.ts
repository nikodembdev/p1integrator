/**
 * Stałe skierowania do szpitala psychiatrycznego
 * (plCdaReferralToPsychiatricHospital, CDA PL IG 1.3.2).
 */

export const PSYCHIATRIC_TEMPLATE = {
  PSYCHIATRIC_REFERRAL: "2.16.840.1.113883.3.4424.13.10.1.12",
  /** Komponent structuredBody dla skierowania psychiatrycznego. */
  STRUCTURED_BODY: "2.16.840.1.113883.3.4424.13.10.2.41",
  /** recordTarget psychiatryczny (wymaga birthplace). */
  RECORD_TARGET: "2.16.840.1.113883.3.4424.13.10.2.40",
  SOCIAL_HISTORY_SECTION: "2.16.840.1.113883.3.4424.13.10.3.17",
  DIAGNOSIS_SECTION: "2.16.840.1.113883.3.4424.13.10.3.20",
  PRESCRIPTIONS_SECTION: "2.16.840.1.113883.3.4424.13.10.3.21",
  REASON_SECTION: "2.16.840.1.113883.3.4424.13.10.3.22",
  REQUESTED_ENCOUNTER_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.11",
} as const;

export const PSYCHIATRIC_LOINC = {
  SOCIAL_HISTORY: "29762-2",
  DIAGNOSIS: "29548-5",
  PRESCRIPTIONS: "57828-6",
  REASON: "42349-1",
} as const;
