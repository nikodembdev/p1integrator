import { buildClinicalDocumentHeader } from "./clinical-document.js";
import type { CorrespondenceMode } from "./constants.js";
import {
  buildCorrespondenceSection,
  buildDiagnosesSection,
  buildLabResultsSection,
  buildMedicalHistorySection,
  buildPhysicalExamSection,
  buildSocialHistorySection,
  type LabResult,
  type PhysicalExam,
  type ReferralDiagnoses,
  type ReferralMedicalHistory,
} from "./sections.js";
import type { CdaSection, ClinicalDocumentHeaderInput, ClinicalDocumentResult } from "./types.js";

export interface HealthResortReferralInput extends Omit<
  ClinicalDocumentHeaderInput,
  "bodyComponents"
> {
  readonly socialHistory?: string;
  readonly medicalHistory?: ReferralMedicalHistory;
  readonly physicalExam?: PhysicalExam;
  readonly diagnoses: ReferralDiagnoses;
  readonly labResults?: readonly LabResult[];
  readonly correspondenceMode: CorrespondenceMode;
}

/**
 * Buduje kompletny dokument CDA „skierowanie do uzdrowiska": nagłówek + sekcje
 * body w kolejności zgodnej z IG: wywiad społeczny → wywiad → badanie przedmiotowe
 * → rozpoznania → wyniki badań → korespondencja.
 */
export function buildHealthResortReferralCda(
  input: HealthResortReferralInput,
): ClinicalDocumentResult {
  const sections: CdaSection[] = [];
  if (input.socialHistory) sections.push(buildSocialHistorySection(input.socialHistory));
  if (input.medicalHistory) sections.push(buildMedicalHistorySection(input.medicalHistory));
  if (input.physicalExam) sections.push(buildPhysicalExamSection(input.physicalExam));
  sections.push(buildDiagnosesSection(input.diagnoses));
  if (input.labResults && input.labResults.length > 0) {
    sections.push(buildLabResultsSection(input.labResults));
  }
  sections.push(buildCorrespondenceSection(input.correspondenceMode));

  const {
    socialHistory: _s,
    medicalHistory: _m,
    physicalExam: _p,
    diagnoses: _d,
    labResults: _l,
    correspondenceMode: _c,
    ...header
  } = input;
  return buildClinicalDocumentHeader({ ...header, bodyComponents: sections });
}
