import {
  buildClinicalDocument,
  type CdaSection,
  type ClinicalDocumentInput,
  type ClinicalDocumentResult,
} from "@p1/cda";
import type { P1Error, Result } from "@p1/core";
import {
  type Attachment,
  buildAttachmentsSection,
  buildReferralDocumentCode,
} from "../common/index.js";
import {
  submitReferralDocument,
  type ReferralSubmissionResult,
  type ReferralTransport,
} from "../submit.js";
import { OCCUPATIONAL_DOC, OCCUPATIONAL_TEMPLATE } from "./constants.js";
import {
  buildOccupationalDiseaseDiagnosisSection,
  buildOccupationalDiseasePrescriptionsSection,
  buildOccupationalExposureSection,
  buildOccupationHistorySection,
  type OccupationalDiseaseDiagnosis,
} from "./sections.js";

/**
 * Wejście skierowania z podejrzeniem choroby zawodowej. Uwaga: `title` MUSI wynosić dokładnie
 * „Skierowanie na badanie w związku z podejrzeniem choroby zawodowej" (wymóg Schematron P1).
 */
export interface OccupationalDiseaseReferralInput extends Omit<
  ClinicalDocumentInput,
  "templateId" | "code" | "sections" | "structuredBodyTemplateId" | "recordTargetTemplateId"
> {
  /** Wywiad zawodowy (sekcja obowiązkowa, narracyjna). */
  readonly occupationHistory: string;
  /** Podejrzewana choroba zawodowa (sekcja obowiązkowa z wpisem .4.12). */
  readonly diagnosis: OccupationalDiseaseDiagnosis;
  /** Czynniki narażenia zawodowego (sekcja obowiązkowa, narracyjna). */
  readonly occupationalExposure: string;
  readonly attachments?: readonly Attachment[];
}

/**
 * Buduje dokument CDA skierowania z podejrzeniem choroby zawodowej (templateId .1.13).
 * Sekcje obowiązkowe: wywiad zawodowy (.3.23) → rozpoznanie (.3.24) →
 * czynniki narażenia (.3.25) → przedmiot skierowania (.3.26, poradnia medycyny pracy);
 * opcjonalnie załączniki (.3.39).
 */
export function buildOccupationalDiseaseReferralCda(
  input: OccupationalDiseaseReferralInput,
): ClinicalDocumentResult {
  const sections: CdaSection[] = [
    buildOccupationHistorySection(input.occupationHistory),
    buildOccupationalDiseaseDiagnosisSection(input.diagnosis),
    buildOccupationalExposureSection(input.occupationalExposure),
    buildOccupationalDiseasePrescriptionsSection(),
  ];
  if (input.attachments && input.attachments.length > 0) {
    sections.push(buildAttachmentsSection(input.attachments));
  }

  const {
    occupationHistory: _o,
    diagnosis: _d,
    occupationalExposure: _e,
    attachments: _a,
    ...header
  } = input;
  return buildClinicalDocument({
    ...header,
    templateId: { root: OCCUPATIONAL_TEMPLATE.OCCUPATIONAL_REFERRAL, extension: "1.3.2" },
    structuredBodyTemplateId: OCCUPATIONAL_TEMPLATE.STRUCTURED_BODY,
    recordTargetTemplateId: OCCUPATIONAL_TEMPLATE.RECORD_TARGET,
    code: buildReferralDocumentCode({
      loinc: OCCUPATIONAL_DOC.LOINC,
      loincDisplay: OCCUPATIONAL_DOC.LOINC_DISPLAY,
      p1Class: OCCUPATIONAL_DOC.P1_CLASS,
      p1ClassDisplay: OCCUPATIONAL_DOC.P1_CLASS_DISPLAY,
    }),
    sections,
  });
}

/** Wystawia skierowanie z podejrzeniem choroby zawodowej end-to-end (reużywa orkiestracji). */
export function issueOccupationalDiseaseReferral(
  input: OccupationalDiseaseReferralInput,
  transport: ReferralTransport,
): Promise<Result<ReferralSubmissionResult, P1Error>> {
  return submitReferralDocument(buildOccupationalDiseaseReferralCda(input).xml, transport);
}
