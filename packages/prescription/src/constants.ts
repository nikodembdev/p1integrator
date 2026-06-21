/**
 * Stałe recepty na lek (plCdaDrugPrescription, CDA PL PRE / IHE Pharmacy 1.3.2).
 * Wartości i szablony odwzorowane z oficjalnego wzorca „recepta-poprawna".
 */

/** templateId dokumentu (P1 + IHE). */
export const PRESCRIPTION_DOC_TEMPLATE = {
  IHE_MEDICAL_DOCUMENT: "1.3.6.1.4.1.19376.1.9.1.1.1",
  IHE_PRESCRIPTION: "1.3.6.1.4.1.19376.1.5.3.1.1.1",
  DRUG_PRESCRIPTION: "2.16.840.1.113883.3.4424.13.10.1.3",
} as const;

/** Szablony nagłówka. */
export const PRESCRIPTION_HEADER_TEMPLATE = {
  RECORD_TARGET: "2.16.840.1.113883.3.4424.13.10.2.23",
  AUTHOR: "2.16.840.1.113883.3.4424.13.10.2.82",
  PERSON: "2.16.840.1.113883.3.4424.13.10.2.1",
  ORGANIZATION_UNIT: "2.16.840.1.113883.3.4424.13.10.2.17",
  WHOLE_ORGANIZATION: "2.16.840.1.113883.3.4424.13.10.2.2",
  CUSTODIAN: "2.16.840.1.113883.3.4424.13.10.2.20",
  LEGAL_AUTHENTICATOR: "2.16.840.1.113883.3.4424.13.10.2.6",
} as const;

/** Sekcja recepty (Rp) + wpis leku. */
export const PRESCRIPTION_SECTION_TEMPLATE = {
  SECTION_IHE: "1.3.6.1.4.1.19376.1.9.1.2.1",
  SECTION: "2.16.840.1.113883.3.4424.13.10.3.4",
} as const;

/** templateId wpisu substanceAdministration (lek). */
export const SUBSTANCE_ADMINISTRATION_TEMPLATE = [
  "1.3.6.1.4.1.19376.1.9.1.3.2",
  "2.16.840.1.113883.10.20.1.24",
  "1.3.6.1.4.1.19376.1.5.3.1.4.7",
  "1.3.6.1.4.1.19376.1.9.1.3.6",
  "1.3.6.1.4.1.19376.1.5.3.1.4.7.1",
  "2.16.840.1.113883.3.4424.13.10.4.3",
] as const;

export const MANUFACTURED_PRODUCT_TEMPLATE = [
  "2.16.840.1.113883.10.20.1.53",
  "1.3.6.1.4.1.19376.1.5.3.1.4.7.2",
] as const;

export const MANUFACTURED_MATERIAL_TEMPLATE = [
  "1.3.6.1.4.1.19376.1.9.1.3.1",
  "2.16.840.1.113883.3.4424.13.10.4.54",
] as const;

export const SUPPLY_TEMPLATE = [
  "1.3.6.1.4.1.19376.1.9.1.3.8",
  "2.16.840.1.113883.3.4424.13.10.4.55",
  "2.16.840.1.113883.3.4424.13.10.4.57",
] as const;

export const SUBSTITUTION_ACT_TEMPLATE = [
  "1.3.6.1.4.1.19376.1.9.1.3.9.1",
  "2.16.840.1.113883.3.4424.13.10.4.56",
] as const;

export const DOSAGE_INSTRUCTION_ACT_TEMPLATE = [
  "2.16.840.1.113883.3.4424.13.10.4.74",
  "2.16.840.1.113883.10.20.1.49",
  "1.3.6.1.4.1.19376.1.5.3.1.4.3",
] as const;

/** Sekcja „Dane o ubezpieczeniu i uprawnieniach" (.3.69, plCdaPayersSection). */
export const PAYERS_SECTION_TEMPLATE = [
  "2.16.840.1.113883.10.20.1.9",
  "1.3.6.1.4.1.19376.1.5.3.1.1.5.3.7",
  "2.16.840.1.113883.3.4424.13.10.3.69",
] as const;

/** Akt autoryzacji płatności (.4.51, plCdaAuthorizationActivityEntry). */
export const AUTHORIZATION_ACT_TEMPLATE = [
  "2.16.840.1.113883.10.20.1.20",
  "2.16.840.1.113883.3.4424.13.10.4.51",
] as const;

/** Uprawnienie dodatkowe (.4.61, plCdaSpecialEntitlementPolicyEntry). */
export const SPECIAL_ENTITLEMENT_TEMPLATE = [
  "2.16.840.1.113883.10.20.1.26",
  "2.16.840.1.113883.3.4424.13.10.4.61",
] as const;

/** Akt autoryzacji odnoszący uprawnienie do pozycji recepty (.4.69). */
export const ENTITLEMENT_AUTHORIZATION_TEMPLATE = [
  "2.16.840.1.113883.10.20.1.19",
  "2.16.840.1.113883.3.4424.13.10.4.69",
] as const;

/** Dokument uprawnienia (.4.59, plCdaEntitlementDocument). */
export const ENTITLEMENT_DOCUMENT_TEMPLATE = "2.16.840.1.113883.3.4424.13.10.4.59";

/** Poziomy odpłatności za leki (PoziomOdplatnosciZaLeki, codeSystem .11.1.1). */
export const PAYMENT_LEVELS = {
  B: "bezpłatne",
  R: "ryczałt",
  "30%": "30% limitu",
  "50%": "50% limitu",
  "100%": "pełnopłatne",
} as const;

/** Kategorie dostępności leku (KDLEK, codeSystem .11.1.25). */
export const DRUG_AVAILABILITY_CATEGORIES = {
  Rp: "Rp",
  Rpw: "Rpw",
  Rpz: "Rpz",
  OTC: "OTC",
} as const;

/** Rodzaj recepty elektronicznej (RRECE, codeSystem .13.5.1). */
export const PRESCRIPTION_TYPES = {
  ZW: "zwykła",
  PA: "pro auctore",
  PF: "pro familia",
} as const;

/** Szablon supply „całkowita dawka substancji czynnej" (Rpw, .4.80). */
export const TOTAL_ACTIVE_DOSE_TEMPLATE = "2.16.840.1.113883.3.4424.13.10.4.80";
/** Kod CDSC (Całkowita Dawka Substancji Czynnej) + jego system. */
export const TOTAL_ACTIVE_DOSE_CODE = "CDSC";
export const TOTAL_ACTIVE_DOSE_CODE_SYSTEM = "2.16.840.1.113883.3.4424.13.5.3.14";

/** Uprawnienia dodatkowe publicznego ubezpieczenia (RLUD, codeSystem .11.3.1). */
export const ADDITIONAL_ENTITLEMENTS = {
  AZ: "AZ",
  BW: "BW",
  CN: "CN",
  DN: "DN",
  IB: "IB",
  IN: "IN",
  IW: "IW",
  PO: "PO",
  WP: "WP",
  ZK: "ZK",
  S: "S",
  C: "C",
  WE: "WE",
  DZ: "DZ",
} as const;

/** Kody i systemy kodowania recepty. */
export const PRESCRIPTION_CODE = {
  DOC_LOINC: "57833-6",
  DOC_LOINC_DISPLAY: "Prescription for medication Document",
  DOC_P1_CLASS: "04.01",
  DOC_P1_CLASS_DISPLAY: "Recepta",
  SECTION_LOINC: "57828-6",
  PAYMENT_LOINC: "48768-6",
  SUBSTITUTION: "N", // HL7 Substance Admin Substitution (N = nie zamieniać)
  DOSAGE_INSTRUCTION: "PINSTRUCT",
} as const;

export const PRESCRIPTION_OID = {
  POLISH_CLASSIFIERS: "2.16.840.1.113883.3.4424.13.5.1",
  DRUG_AVAILABILITY: "2.16.840.1.113883.3.4424.11.1.25", // KDLEK value (Rp/OTC/...)
  ENTITLEMENT_VALUE: "2.16.840.1.113883.3.4424.11.3.1", // RLUD value (uprawnienia dodatkowe)
  DRUG_ID: "2.16.840.1.113883.3.4424.6.1", // kod leku (manufacturedMaterial)
  SUBSTANCE_ID: "2.16.840.1.113883.3.4424.6.3", // substancja czynna
  GS1: "1.3.160", // EAN opakowania
  FORM_CODE: "0.4.0.127.0.16.1.1.2.1", // postać farmaceutyczna
  PAYMENT_LEVEL: "2.16.840.1.113883.3.4424.11.1.1", // poziom odpłatności
  NFZ_BRANCH: "2.16.840.1.113883.3.4424.3.1",
  HL7_ACT: "2.16.840.1.113883.5.4", // PUBLICPOL
  HL7_SUBSTITUTION: "2.16.840.1.113883.5.1070",
  IHE_ACT: "1.3.6.1.4.1.19376.1.5.3.2", // PINSTRUCT
} as const;
