import {
  buildClinicalDocument,
  CDA_OID,
  type CdaSection,
  type ClinicalDocumentInput,
  type ClinicalDocumentResult,
  type XmlObject,
} from "@p1/cda";
import {
  type CorrespondenceMode,
  LOINC_CODE,
  REALIZATION_MODE,
  type RealizationMode,
  REFERRAL_TEMPLATE,
  TREATMENT_TYPE,
  type TreatmentType,
} from "./constants.js";
import {
  type Attachment,
  buildAttachmentsSection,
  buildDiagnosesSection,
  type ReferralDiagnoses,
} from "../common/index.js";
import {
  type AmbulatoryTreatment,
  buildAmbulatoryTreatmentSection,
  buildCorrespondenceSection,
  buildLabResultsSection,
  buildMedicalHistorySection,
  buildPhysicalExamSection,
  buildSocialHistorySection,
  type LabResult,
  type PhysicalExam,
  type ReferralMedicalHistory,
} from "./sections.js";
import type { P1Error, Result } from "@p1/core";
import {
  submitReferralDocument,
  type ReferralSubmissionResult,
  type ReferralTransport,
} from "../submit.js";

const POLISH_CLASSIFIERS_NAME = "PolskieKlasyfikatoryHL7v3";

export interface HealthResortReferralInput extends Omit<
  ClinicalDocumentInput,
  "templateId" | "code" | "sections"
> {
  readonly treatmentType: TreatmentType;
  readonly realizationMode: RealizationMode;
  readonly socialHistory?: string;
  readonly medicalHistory?: ReferralMedicalHistory;
  readonly physicalExam: PhysicalExam;
  readonly diagnoses: ReferralDiagnoses;
  readonly labResults?: readonly LabResult[];
  readonly correspondenceMode: CorrespondenceMode;
  /** Leczenie ambulatoryjne — uwzględniane tylko w trybie realizacji TA. */
  readonly ambulatoryTreatment?: AmbulatoryTreatment;
  readonly attachments?: readonly Attachment[];
}

/** Element `<code>` dokumentu z kwalifikatorami RSUZDR (typ) i TRSU (tryb). */
function buildReferralCode(
  treatmentType: TreatmentType,
  realizationMode: RealizationMode,
): XmlObject {
  const treatment = TREATMENT_TYPE[treatmentType];
  const realization = REALIZATION_MODE[realizationMode];
  const classifier = (code: string, display: string): XmlObject => ({
    "@code": code,
    "@displayName": display,
    "@codeSystem": CDA_OID.POLISH_CLASSIFIERS,
    "@codeSystemName": POLISH_CLASSIFIERS_NAME,
  });
  return {
    "@code": LOINC_CODE.REFERRAL,
    "@codeSystem": CDA_OID.LOINC,
    "@codeSystemName": "LOINC",
    "@displayName": "Prescription for diagnostic or specialist care Document",
    translation: {
      "@code": "02.10",
      "@codeSystem": CDA_OID.DOC_CLASS_P1,
      "@codeSystemName": "KLAS_DOK_P1",
      "@displayName": "Skierowanie na badanie lub leczenie",
      qualifier: [
        {
          name: classifier("RSUZDR", "Rodzaje świadczenia uzdrowiskowego"),
          value: classifier(treatment.code, treatment.display),
        },
        {
          name: classifier("TRSU", "Tryb realizacji świadczenia uzdrowiskowego"),
          value: classifier(realization.code, realization.display),
        },
      ],
    },
  };
}

/**
 * Buduje kompletny dokument CDA „skierowanie do uzdrowiska" na bazie generycznego
 * `buildClinicalDocument` (@p1/cda). Sekcje body w kolejności IG: wywiad społeczny →
 * wywiad → badanie przedmiotowe → rozpoznania → wyniki badań → korespondencja →
 * leczenie ambulatoryjne → załączniki.
 */
export function buildHealthResortReferralCda(
  input: HealthResortReferralInput,
): ClinicalDocumentResult {
  const sections: CdaSection[] = [];
  if (input.socialHistory) sections.push(buildSocialHistorySection(input.socialHistory));
  sections.push(buildMedicalHistorySection(input.medicalHistory ?? {}));
  sections.push(buildPhysicalExamSection(input.physicalExam));
  sections.push(buildDiagnosesSection(input.diagnoses));
  if (input.labResults && input.labResults.length > 0) {
    sections.push(buildLabResultsSection(input.labResults));
  }
  sections.push(buildCorrespondenceSection(input.correspondenceMode));
  if (input.ambulatoryTreatment && input.realizationMode === "TA") {
    sections.push(buildAmbulatoryTreatmentSection(input.ambulatoryTreatment));
  }
  if (input.attachments && input.attachments.length > 0) {
    sections.push(buildAttachmentsSection(input.attachments));
  }

  const {
    treatmentType,
    realizationMode,
    socialHistory: _s,
    medicalHistory: _m,
    physicalExam: _p,
    diagnoses: _d,
    labResults: _l,
    correspondenceMode: _c,
    ambulatoryTreatment: _a,
    attachments: _at,
    ...header
  } = input;

  return buildClinicalDocument({
    ...header,
    templateId: { root: REFERRAL_TEMPLATE.HEALTH_RESORT_REFERRAL, extension: "1.3.2" },
    code: buildReferralCode(treatmentType, realizationMode),
    sections,
  });
}

/**
 * Wystawia skierowanie uzdrowiskowe end-to-end: buduje CDA i wysyła je do P1
 * generyczną orkiestracją (`submitReferralDocument`). Cienki wrapper — pozostałe
 * typy skierowań analogicznie reużyją `submitReferralDocument`.
 */
export function issueHealthResortReferral(
  input: HealthResortReferralInput,
  transport: ReferralTransport,
): Promise<Result<ReferralSubmissionResult, P1Error>> {
  return submitReferralDocument(buildHealthResortReferralCda(input).xml, transport);
}
