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
import { CARE_FACILITY_DOC, CARE_FACILITY_TEMPLATE } from "./constants.js";
import {
  buildAnnotationCommentSection,
  buildBarthelScoreSection,
  buildCareFacilityPrescriptionsSection,
  buildCurrentMedicationSection,
} from "./sections.js";

/**
 * Wejście skierowania do zakładu opiekuńczego. Uwaga: `title` MUSI być jedną z wartości
 * wymaganych przez Schematron P1: „Skierowanie do zakładu opiekuńczo-leczniczego" lub
 * „Skierowanie do zakładu pielęgnacyjno-opiekuńczego". Pacjent musi mieć `phone`/`email`
 * (recordTarget .2.36 wymaga telecom).
 */
export interface CareFacilityReferralInput extends Omit<
  ClinicalDocumentInput,
  "templateId" | "code" | "sections" | "structuredBodyTemplateId" | "recordTargetTemplateId"
> {
  /** Dotychczasowe leczenie (sekcja obowiązkowa, narracyjna). */
  readonly currentMedication: string;
  /** Ocena w skali Barthel (sekcja obowiązkowa, narracyjna). */
  readonly barthelScore: string;
  /** Przedmiot skierowania — komórka zakładu opiekuńczego. */
  readonly encounter: RequestedEncounter;
  /** Uwagi (sekcja obowiązkowa, narracyjna). */
  readonly annotation: string;
  readonly attachments?: readonly Attachment[];
}

/**
 * Buduje dokument CDA skierowania do zakładu opiekuńczego (templateId .1.10).
 * Wariant strukturalny (nie zeskanowany). Sekcje obowiązkowe: dotychczasowe leczenie
 * (.3.13) → skala Barthel (.3.14) → przedmiot skierowania (.3.15) → uwagi (.3.2);
 * opcjonalnie załączniki (.3.39).
 */
export function buildCareFacilityReferralCda(
  input: CareFacilityReferralInput,
): ClinicalDocumentResult {
  const sections: CdaSection[] = [
    buildCurrentMedicationSection(input.currentMedication),
    buildBarthelScoreSection(input.barthelScore),
    buildCareFacilityPrescriptionsSection(input.encounter),
    buildAnnotationCommentSection(input.annotation),
  ];
  if (input.attachments && input.attachments.length > 0) {
    sections.push(buildAttachmentsSection(input.attachments));
  }

  const {
    currentMedication: _m,
    barthelScore: _b,
    encounter: _e,
    annotation: _an,
    attachments: _at,
    ...header
  } = input;
  return buildClinicalDocument({
    ...header,
    templateId: { root: CARE_FACILITY_TEMPLATE.CARE_FACILITY_REFERRAL, extension: "1.3.2" },
    structuredBodyTemplateId: CARE_FACILITY_TEMPLATE.STRUCTURED_BODY,
    recordTargetTemplateId: CARE_FACILITY_TEMPLATE.RECORD_TARGET,
    code: buildReferralDocumentCode({
      loinc: CARE_FACILITY_DOC.LOINC,
      loincDisplay: CARE_FACILITY_DOC.LOINC_DISPLAY,
      p1Class: CARE_FACILITY_DOC.P1_CLASS,
      p1ClassDisplay: CARE_FACILITY_DOC.P1_CLASS_DISPLAY,
    }),
    sections,
  });
}

/** Wystawia skierowanie do zakładu opiekuńczego end-to-end (reużywa generycznej orkiestracji). */
export function issueCareFacilityReferral(
  input: CareFacilityReferralInput,
  transport: ReferralTransport,
): Promise<Result<ReferralSubmissionResult, P1Error>> {
  return submitReferralDocument(buildCareFacilityReferralCda(input).xml, transport);
}
