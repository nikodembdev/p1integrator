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
import { buildProceduresSection, type ReferralProcedures } from "../general/sections.js";
import {
  submitReferralDocument,
  type ReferralSubmissionResult,
  type ReferralTransport,
} from "../submit.js";
import { REHABILITATION_TEMPLATE } from "./constants.js";
import { buildContraindicationsSection } from "./sections.js";

export interface RehabilitationReferralInput extends Omit<
  ClinicalDocumentInput,
  "templateId" | "code" | "sections"
> {
  readonly diagnoses: ReferralDiagnoses;
  /** Cel rehabilitacji / zlecane zabiegi (sekcja .3.6, jak w skierowaniu ogólnym). */
  readonly procedures: ReferralProcedures;
  /** Przeciwwskazania (sekcja obowiązkowa, narracyjna). */
  readonly contraindications: string;
  readonly attachments?: readonly Attachment[];
}

/**
 * Buduje dokument CDA skierowania na rehabilitację (templateId .1.29).
 * Sekcje obowiązkowe: rozpoznania (.3.1) → cel/procedury (.3.6) → przeciwwskazania (.3.72);
 * opcjonalnie załączniki (.3.39).
 */
export function buildRehabilitationReferralCda(
  input: RehabilitationReferralInput,
): ClinicalDocumentResult {
  const sections: CdaSection[] = [
    buildDiagnosesSection(input.diagnoses),
    buildProceduresSection(input.procedures),
    buildContraindicationsSection(input.contraindications),
  ];
  if (input.attachments && input.attachments.length > 0) {
    sections.push(buildAttachmentsSection(input.attachments));
  }

  const {
    diagnoses: _d,
    procedures: _p,
    contraindications: _c,
    attachments: _a,
    ...header
  } = input;
  return buildClinicalDocument({
    ...header,
    templateId: { root: REHABILITATION_TEMPLATE.REHABILITATION_REFERRAL, extension: "1.3.2" },
    structuredBodyTemplateId: REHABILITATION_TEMPLATE.STRUCTURED_BODY,
    code: buildReferralDocumentCode({
      loinc: "57832-8",
      loincDisplay: "Prescription for diagnostic or specialist care Document",
      p1Class: "02.10",
      p1ClassDisplay: "Skierowanie na badanie lub leczenie",
    }),
    sections,
  });
}

/** Wystawia skierowanie na rehabilitację end-to-end (reużywa generycznej orkiestracji). */
export function issueRehabilitationReferral(
  input: RehabilitationReferralInput,
  transport: ReferralTransport,
): Promise<Result<ReferralSubmissionResult, P1Error>> {
  return submitReferralDocument(buildRehabilitationReferralCda(input).xml, transport);
}
