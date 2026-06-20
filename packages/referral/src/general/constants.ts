/**
 * Stałe specyficzne dla skierowania ogólnego (plCdaReferral, CDA PL IG 1.3.2).
 */

export const GENERAL_TEMPLATE = {
  GENERAL_REFERRAL: "2.16.840.1.113883.3.4424.13.10.1.4",
  /** Komponent structuredBody dla skierowania ogólnego (inny niż uzdrowiskowy 2.35). */
  STRUCTURED_BODY: "2.16.840.1.113883.3.4424.13.10.2.28",
  PROCEDURES_SECTION: "2.16.840.1.113883.3.4424.13.10.3.6",
  PROCEDURE_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.6",
} as const;

export const GENERAL_LOINC = {
  DOCUMENT: "57832-8",
  PROCEDURES: "57828-6",
} as const;

/** Klasyfikacja komórki organizacyjnej (miejsce realizacji). */
export const INDUSTRY_CLASS_OID = "2.16.840.1.113883.3.4424.11.2.4";
