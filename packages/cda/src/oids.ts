/**
 * Generyczne stałe HL7 CDA PL IG 1.3.2 wspólne dla wszystkich dokumentów P1:
 * systemy kodowania, węzły OID identyfikatorów i szablony części nagłówka.
 * Stałe specyficzne dla typu dokumentu (sekcje, kody dokumentu) żyją w modułach
 * domenowych (@p1/referral, @p1/prescription).
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
  /** Specjalności komórek organizacyjnych (cz. VIII kodu resortowego) — miejsce/przedmiot skierowania. */
  ORG_CELL_SPECIALTY: "2.16.840.1.113883.3.4424.11.2.4",
  SPECIALTY_CODES: "2.16.840.1.113883.3.4424.11.3.3.1",
  FUNCTION_CODES: "2.16.840.1.113883.3.4424.11.3.18",
  DOC_CLASS_P1: "2.16.840.1.113883.3.4424.11.1.32",
  POLISH_CLASSIFIERS: "2.16.840.1.113883.3.4424.13.5.1",
} as const;

/** Szablony części nagłówka CDA (wspólne dla typów dokumentów). */
export const CDA_TEMPLATE = {
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
} as const;

export type Gender = "M" | "F" | "UN";
