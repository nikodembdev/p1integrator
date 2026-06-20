/**
 * Stałe sekcji współdzielonych przez typy skierowań (rozpoznania, załączniki).
 */

export const COMMON_TEMPLATE = {
  DIAGNOSES_SECTION: "2.16.840.1.113883.3.4424.13.10.3.1",
  MAIN_DIAGNOSIS_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.1",
  SECONDARY_DIAGNOSIS_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.2",
  ATTACHMENTS_SECTION: "2.16.840.1.113883.3.4424.13.10.3.39",
  ATTACHMENT_ORGANIZER_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.31",
  ATTACHMENT_REFERENCE_ENTRY: "2.16.840.1.113883.3.4424.13.10.4.32",
  EXTERNAL_DOCUMENT: "2.16.840.1.113883.3.4424.13.10.4.33",
  EXTERNAL_DOCUMENT_SCAN: "2.16.840.1.113883.3.4424.13.10.4.34",
} as const;

export const DIAGNOSIS_LOINC = "29548-5";

/** Kody SNOMED CT w sekcji rozpoznań. */
export const SNOMED_CODE = {
  PRINCIPAL_DIAGNOSIS: { code: "8319008", display: "Principal diagnosis" },
  SECONDARY_DIAGNOSIS: { code: "85097005", display: "Secondary diagnosis" },
} as const;

/** Strona ciała (targetSiteCode, SNOMED CT). */
export const BODY_SIDE = {
  LEFT: { code: "7771000", display: "Left (qualifier value)" },
  RIGHT: { code: "24028007", display: "Right (qualifier value)" },
  BOTH: { code: "51440002", display: "Bilateral (qualifier value)" },
} as const;
export type BodySide = keyof typeof BODY_SIDE;
