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
  buildDiagnosesSection,
  buildReferralDocumentCode,
  type ReferralDiagnoses,
} from "../common/index.js";
import {
  submitReferralDocument,
  type ReferralSubmissionResult,
  type ReferralTransport,
} from "../submit.js";
import { GENERAL_LOINC, GENERAL_TEMPLATE } from "./constants.js";
import { buildProceduresSection, type ReferralProcedures } from "./sections.js";

export interface GeneralReferralInput extends Omit<
  ClinicalDocumentInput,
  "templateId" | "code" | "sections"
> {
  readonly diagnoses: ReferralDiagnoses;
  readonly procedures: ReferralProcedures;
  readonly attachments?: readonly Attachment[];
}

/**
 * Buduje dokument CDA skierowania ogólnego (do poradni/szpitala) na bazie
 * generycznego `buildClinicalDocument`. Sekcje: rozpoznania → procedury → załączniki.
 */
export function buildGeneralReferralCda(input: GeneralReferralInput): ClinicalDocumentResult {
  const sections: CdaSection[] = [
    buildDiagnosesSection(input.diagnoses),
    buildProceduresSection(input.procedures),
  ];
  if (input.attachments && input.attachments.length > 0) {
    sections.push(buildAttachmentsSection(input.attachments));
  }

  const { diagnoses: _d, procedures: _p, attachments: _a, ...header } = input;
  return buildClinicalDocument({
    ...header,
    templateId: { root: GENERAL_TEMPLATE.GENERAL_REFERRAL, extension: "1.3.2" },
    structuredBodyTemplateId: GENERAL_TEMPLATE.STRUCTURED_BODY,
    code: buildReferralDocumentCode({
      loinc: GENERAL_LOINC.DOCUMENT,
      loincDisplay: "Prescription for diagnostic or specialist care Document",
      p1Class: "02.10",
      p1ClassDisplay: "Skierowanie na badanie lub leczenie",
    }),
    sections,
  });
}

/** Wystawia skierowanie ogólne end-to-end (reużywa generycznej orkiestracji). */
export function issueGeneralReferral(
  input: GeneralReferralInput,
  transport: ReferralTransport,
): Promise<Result<ReferralSubmissionResult, P1Error>> {
  return submitReferralDocument(buildGeneralReferralCda(input).xml, transport);
}
