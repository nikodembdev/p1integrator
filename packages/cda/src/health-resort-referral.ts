import { buildClinicalDocumentHeader } from "./clinical-document.js";
import type { CorrespondenceMode } from "./constants.js";
import {
  buildCorrespondenceSection,
  buildDiagnosesSection,
  buildMedicalHistorySection,
  buildSocialHistorySection,
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
  readonly diagnoses: ReferralDiagnoses;
  readonly correspondenceMode: CorrespondenceMode;
}

/**
 * Buduje kompletny dokument CDA „skierowanie do uzdrowiska": nagłówek
 * (`@p1/cda` PR1) + sekcje body. Kolejność sekcji zgodna z IG: wywiad społeczny →
 * wywiad → rozpoznania → korespondencja. Sekcje badania fizykalnego, wyników
 * i załączników dojdą w kolejnym kroku.
 */
export function buildHealthResortReferralCda(
  input: HealthResortReferralInput,
): ClinicalDocumentResult {
  const sections: CdaSection[] = [];
  if (input.socialHistory) sections.push(buildSocialHistorySection(input.socialHistory));
  if (input.medicalHistory) sections.push(buildMedicalHistorySection(input.medicalHistory));
  sections.push(buildDiagnosesSection(input.diagnoses));
  sections.push(buildCorrespondenceSection(input.correspondenceMode));

  const {
    socialHistory: _s,
    medicalHistory: _m,
    diagnoses: _d,
    correspondenceMode: _c,
    ...header
  } = input;
  return buildClinicalDocumentHeader({ ...header, bodyComponents: sections });
}
