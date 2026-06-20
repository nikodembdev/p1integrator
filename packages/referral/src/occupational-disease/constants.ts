/**
 * Stałe skierowania na badanie w związku z podejrzeniem choroby zawodowej
 * (plCdaReferralDueToSuspectedOccupationalDisease, CDA PL IG 1.3.2).
 */

export const OCCUPATIONAL_TEMPLATE = {
  OCCUPATIONAL_REFERRAL: "2.16.840.1.113883.3.4424.13.10.1.13",
  STRUCTURED_BODY: "2.16.840.1.113883.3.4424.13.10.2.43",
  RECORD_TARGET: "2.16.840.1.113883.3.4424.13.10.2.42",
  OCCUPATION_HISTORY_SECTION: "2.16.840.1.113883.3.4424.13.10.3.23",
  DIAGNOSIS_SECTION: "2.16.840.1.113883.3.4424.13.10.3.24",
  EXPOSURE_SECTION: "2.16.840.1.113883.3.4424.13.10.3.25",
  PRESCRIPTIONS_SECTION: "2.16.840.1.113883.3.4424.13.10.3.26",
  DIAGNOSIS_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.12",
  REQUESTED_ENCOUNTER_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.13",
} as const;

export const OCCUPATIONAL_LOINC = {
  OCCUPATION_HISTORY: "11340-7",
  DIAGNOSIS: "29548-5",
  EXPOSURE: "10161-8",
  PRESCRIPTIONS: "57828-6",
} as const;

/** System kodowania chorób zawodowych (wykaz chorób zawodowych). */
export const OCCUPATIONAL_DISEASE_OID = "2.16.840.1.113883.3.4424.11.1.16";

/** Skierowanie z podejrzeniem choroby zawodowej zawsze kierowane do poradni medycyny pracy. */
export const OCCUPATIONAL_MEDICINE_CELL = {
  code: "1160",
  name: "Poradnia medycyny pracy",
} as const;

/** Kod dokumentu i klasyfikacja P1 (jak skierowanie ogólne). */
export const OCCUPATIONAL_DOC = {
  LOINC: "57832-8",
  LOINC_DISPLAY: "Prescription for diagnostic or specialist care Document",
  P1_CLASS: "02.10",
  P1_CLASS_DISPLAY: "Skierowanie na badanie lub leczenie",
} as const;
