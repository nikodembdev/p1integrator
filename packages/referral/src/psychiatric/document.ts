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
  type ReferralDiagnoses,
} from "../common/index.js";
import {
  submitReferralDocument,
  type ReferralSubmissionResult,
  type ReferralTransport,
} from "../submit.js";
import { PSYCHIATRIC_TEMPLATE } from "./constants.js";
import {
  buildPsychiatricDiagnosisSection,
  buildPsychiatricPrescriptionsSection,
  buildPsychiatricReasonForReferralSection,
  buildPsychiatricSocialHistorySection,
  type PsychiatricEncounter,
} from "./sections.js";

export interface PsychiatricReferralInput extends Omit<
  ClinicalDocumentInput,
  "templateId" | "code" | "sections" | "structuredBodyTemplateId" | "recordTargetTemplateId"
> {
  readonly socialHistory: string;
  readonly diagnoses: ReferralDiagnoses;
  readonly encounter: PsychiatricEncounter;
  readonly reasonForReferral: string;
  readonly attachments?: readonly Attachment[];
}

/**
 * Buduje dokument CDA skierowania do szpitala psychiatrycznego (templateId .1.12).
 * Wymaga recordTarget .2.40 z miejscem urodzenia (birthplace). Sekcje obowiązkowe:
 * wywiad społeczny (.3.17) → rozpoznania (.3.20) → przedmiot skierowania (.3.21) →
 * powód skierowania (.3.22); opcjonalnie załączniki (.3.39).
 */
export function buildPsychiatricReferralCda(
  input: PsychiatricReferralInput,
): ClinicalDocumentResult {
  const sections: CdaSection[] = [
    buildPsychiatricSocialHistorySection(input.socialHistory),
    buildPsychiatricDiagnosisSection(input.diagnoses),
    buildPsychiatricPrescriptionsSection(input.encounter),
    buildPsychiatricReasonForReferralSection(input.reasonForReferral),
  ];
  if (input.attachments && input.attachments.length > 0) {
    sections.push(buildAttachmentsSection(input.attachments));
  }

  const {
    socialHistory: _s,
    diagnoses: _d,
    encounter: _e,
    reasonForReferral: _r,
    attachments: _a,
    ...header
  } = input;
  return buildClinicalDocument({
    ...header,
    templateId: { root: PSYCHIATRIC_TEMPLATE.PSYCHIATRIC_REFERRAL, extension: "1.3.2" },
    structuredBodyTemplateId: PSYCHIATRIC_TEMPLATE.STRUCTURED_BODY,
    recordTargetTemplateId: PSYCHIATRIC_TEMPLATE.RECORD_TARGET,
    code: buildReferralDocumentCode({
      loinc: "57832-8",
      loincDisplay: "Prescription for diagnostic or specialist care Document",
      p1Class: "02.10",
      p1ClassDisplay: "Skierowanie na badanie lub leczenie",
    }),
    sections,
  });
}

/** Wystawia skierowanie psychiatryczne end-to-end (reużywa generycznej orkiestracji). */
export function issuePsychiatricReferral(
  input: PsychiatricReferralInput,
  transport: ReferralTransport,
): Promise<Result<ReferralSubmissionResult, P1Error>> {
  return submitReferralDocument(buildPsychiatricReferralCda(input).xml, transport);
}
