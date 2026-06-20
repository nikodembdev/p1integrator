import {
  buildClinicalDocument,
  CDA_OID,
  type CdaSection,
  type ClinicalDocumentInput,
  type ClinicalDocumentResult,
  type XmlObject,
} from "@p1/cda";
import type { P1Error, Result } from "@p1/core";
import {
  type Attachment,
  buildAttachmentsSection,
  buildDiagnosesSection,
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

/** Element `<code>` skierowania ogólnego (bez kwalifikatorów uzdrowiskowych). */
function buildGeneralCode(): XmlObject {
  return {
    "@code": GENERAL_LOINC.DOCUMENT,
    "@codeSystem": CDA_OID.LOINC,
    "@codeSystemName": "LOINC",
    "@displayName": "Prescription for diagnostic or specialist care Document",
    translation: {
      "@code": "02.10",
      "@displayName": "Skierowanie na badanie lub leczenie",
      "@codeSystem": CDA_OID.DOC_CLASS_P1,
      "@codeSystemName": "KLAS_DOK_P1",
    },
  };
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
    code: buildGeneralCode(),
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
