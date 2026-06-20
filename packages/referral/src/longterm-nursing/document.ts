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
  type RequestedEncounter,
} from "../common/index.js";
import {
  submitReferralDocument,
  type ReferralSubmissionResult,
  type ReferralTransport,
} from "../submit.js";
import { LONGTERM_NURSING_DOC, LONGTERM_NURSING_TEMPLATE } from "./constants.js";
import {
  buildLongtermNursingHistorySection,
  buildLongtermNursingPhysicalFindingsSection,
  buildLongtermNursingPrescriptionsSection,
} from "./sections.js";

/**
 * Wejście skierowania do opieki długoterminowej. Uwaga: `title` MUSI wynosić dokładnie
 * „Skierowanie na objęcie pielęgniarską opieką długoterminową" (wymóg Schematron P1).
 */
export interface LongtermNursingReferralInput extends Omit<
  ClinicalDocumentInput,
  "templateId" | "code" | "sections" | "structuredBodyTemplateId" | "recordTargetTemplateId"
> {
  /** Wywiad (sekcja obowiązkowa, narracyjna). */
  readonly history: string;
  /** Badanie przedmiotowe (sekcja obowiązkowa, narracyjna). */
  readonly physicalFindings: string;
  /** Przedmiot skierowania — komórka pielęgniarskiej opieki długoterminowej. */
  readonly encounter: RequestedEncounter;
  readonly attachments?: readonly Attachment[];
}

/**
 * Buduje dokument CDA skierowania do pielęgniarskiej opieki długoterminowej (templateId .1.11).
 * Sekcje obowiązkowe: wywiad (.3.10) → badanie przedmiotowe (.3.11) →
 * przedmiot skierowania (.3.16); opcjonalnie załączniki (.3.39).
 */
export function buildLongtermNursingReferralCda(
  input: LongtermNursingReferralInput,
): ClinicalDocumentResult {
  const sections: CdaSection[] = [
    buildLongtermNursingHistorySection(input.history),
    buildLongtermNursingPhysicalFindingsSection(input.physicalFindings),
    buildLongtermNursingPrescriptionsSection(input.encounter),
  ];
  if (input.attachments && input.attachments.length > 0) {
    sections.push(buildAttachmentsSection(input.attachments));
  }

  const { history: _h, physicalFindings: _p, encounter: _e, attachments: _a, ...header } = input;
  return buildClinicalDocument({
    ...header,
    templateId: { root: LONGTERM_NURSING_TEMPLATE.LONGTERM_NURSING_REFERRAL, extension: "1.3.2" },
    structuredBodyTemplateId: LONGTERM_NURSING_TEMPLATE.STRUCTURED_BODY,
    recordTargetTemplateId: LONGTERM_NURSING_TEMPLATE.RECORD_TARGET,
    code: buildReferralDocumentCode({
      loinc: LONGTERM_NURSING_DOC.LOINC,
      loincDisplay: LONGTERM_NURSING_DOC.LOINC_DISPLAY,
      p1Class: LONGTERM_NURSING_DOC.P1_CLASS,
      p1ClassDisplay: LONGTERM_NURSING_DOC.P1_CLASS_DISPLAY,
    }),
    sections,
  });
}

/** Wystawia skierowanie do opieki długoterminowej end-to-end (reużywa generycznej orkiestracji). */
export function issueLongtermNursingReferral(
  input: LongtermNursingReferralInput,
  transport: ReferralTransport,
): Promise<Result<ReferralSubmissionResult, P1Error>> {
  return submitReferralDocument(buildLongtermNursingReferralCda(input).xml, transport);
}
