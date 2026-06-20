/**
 * Stałe dokumentu anulowania skierowania (plCdaNullification, CDA PL IG 1.3.2).
 * Anulowanie to odrębny, prosty dokument IHE (Nullification) z trzema templateId,
 * referencją do dokumentu anulowanego (relatedDocument/parentDocument) i jedną sekcją.
 */

export const NULLIFICATION_TEMPLATE = {
  /** Szablon P1 dokumentu anulującego. */
  NULLIFICATION: "2.16.840.1.113883.3.4424.13.10.1.14",
  /** Dodatkowe szablony IHE (Nullification). */
  IHE_NULLIFICATION: "1.3.6.1.4.1.19376.1.9.1.1.1",
  IHE_MEDICAL_DOCUMENT: "1.3.6.1.4.1.19376.1.5.3.1.1.1",
  RECORD_TARGET: "2.16.840.1.113883.3.4424.13.10.2.3",
  AUTHOR: "2.16.840.1.113883.3.4424.13.10.2.4",
  CUSTODIAN: "2.16.840.1.113883.3.4424.13.10.2.5",
  LEGAL_AUTHENTICATOR: "2.16.840.1.113883.3.4424.13.10.2.6",
  RELATED_DOCUMENT: "2.16.840.1.113883.3.4424.13.10.2.46",
  STRUCTURED_BODY: "2.16.840.1.113883.3.4424.13.10.2.47",
  SECTION: "2.16.840.1.113883.3.4424.13.10.3.27",
} as const;

/** Kod dokumentu anulującego (LOINC „Administrative note" + KLAS_DOK_P1 08.80). */
export const NULLIFICATION_DOC = {
  LOINC: "51851-4",
  LOINC_DISPLAY: "Administrative note",
  P1_CLASS: "08.80",
  P1_CLASS_DISPLAY: "Dokument anulujący",
} as const;

/** Wymagane przez Schematron stałe tytuły. */
export const NULLIFICATION_TITLE = "Dokument anulujący";
export const NULLIFICATION_SECTION_TITLE = "Dane dokumentu anulowanego";
