/**
 * Stałe specyficzne dla skierowania na rehabilitację
 * (plCdaReferralForRehabilitation, CDA PL IG 1.3.2).
 */

export const REHABILITATION_TEMPLATE = {
  REHABILITATION_REFERRAL: "2.16.840.1.113883.3.4424.13.10.1.29",
  /** Komponent structuredBody dla skierowania na rehabilitację (inny niż uzdrowiskowy/ogólny). */
  STRUCTURED_BODY: "2.16.840.1.113883.3.4424.13.10.2.91",
  CONTRAINDICATIONS_SECTION: "2.16.840.1.113883.3.4424.13.10.3.72",
} as const;

/** Kod LOINC sekcji „Przeciwwskazania" (Annotation comment). */
export const CONTRAINDICATIONS_LOINC = "48767-8";
