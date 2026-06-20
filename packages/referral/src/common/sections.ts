import { CDA_OID, type CdaSection, type XmlObject } from "@p1/cda";
import {
  BODY_SIDE,
  type BodySide,
  COMMON_TEMPLATE,
  DIAGNOSIS_LOINC,
  SNOMED_CODE,
} from "./constants.js";

const loinc = (code: string, display: string): Record<string, unknown> => ({
  "@code": code,
  "@codeSystem": CDA_OID.LOINC,
  "@codeSystemName": "LOINC",
  "@displayName": display,
});

// ─────────────────────────────────────────────────────────────
// Generyczne cegiełki sekcji — współdzielone przez typy skierowań
// ─────────────────────────────────────────────────────────────

/** Element `<code>` dokumentu skierowania: LOINC + translation na klasyfikację dokumentów P1. */
export function buildReferralDocumentCode(args: {
  readonly loinc: string;
  readonly loincDisplay: string;
  readonly p1Class: string;
  readonly p1ClassDisplay: string;
}): XmlObject {
  return {
    "@code": args.loinc,
    "@codeSystem": CDA_OID.LOINC,
    "@codeSystemName": "LOINC",
    "@displayName": args.loincDisplay,
    translation: {
      "@code": args.p1Class,
      "@displayName": args.p1ClassDisplay,
      "@codeSystem": CDA_OID.DOC_CLASS_P1,
      "@codeSystemName": "KLAS_DOK_P1",
    },
  };
}

/** Sekcja czysto narracyjna (templateId + code LOINC + title + text). */
export function buildNarrativeSection(args: {
  readonly templateId: string;
  readonly loincCode: string;
  readonly loincDisplay: string;
  readonly title: string;
  readonly text: string;
  readonly contentId: string;
}): CdaSection {
  return {
    templateId: { "@root": args.templateId },
    code: loinc(args.loincCode, args.loincDisplay),
    title: args.title,
    text: { content: { "@ID": args.contentId, "#": args.text } },
  };
}

/** Tryb realizacji skierowania wg HL7 Act Priority: zwykły / pilny. */
export type ReferralPriority = "R" | "UR";
const ACT_PRIORITY_OID = "2.16.840.1.113883.5.7";

/** Przedmiot skierowania: encounter ENC/RQO z kodem specjalności komórki organizacyjnej. */
export interface RequestedEncounter {
  /** Kod specjalności komórki organizacyjnej (cz. VIII kodu resortowego), np. "2700"/"5160". */
  readonly cellCode: string;
  readonly cellName: string;
  /** Tryb realizacji ("R" zwykły / "UR" pilny) — wymagany przez część typów (np. zakład opiekuńczy). */
  readonly priority?: ReferralPriority;
}

/**
 * Wpis „Przedmiot skierowania" (encounter ENC/RQO) — wspólny dla typów wymagających
 * wskazania komórki organizacyjnej (psychiatryczny .4.11, opiekuńczy/długoterminowy .4.9).
 */
export function buildRequestedEncounterEntry(
  entryTemplateId: string,
  encounter: RequestedEncounter,
  referenceId: string,
): XmlObject {
  return {
    templateId: { "@root": entryTemplateId },
    encounter: {
      "@classCode": "ENC",
      "@moodCode": "RQO",
      code: {
        "@code": encounter.cellCode,
        "@codeSystem": CDA_OID.ORG_CELL_SPECIALTY,
        "@displayName": encounter.cellName,
      },
      text: { reference: { "@value": `#${referenceId}` } },
      ...(encounter.priority
        ? {
            priorityCode: {
              "@code": encounter.priority,
              "@codeSystem": ACT_PRIORITY_OID,
              "@codeSystemName": "Act Priority",
              "@displayName": encounter.priority === "UR" ? "urgent" : "routine",
            },
          }
        : {}),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Rozpoznania (Diagnoses) — wspólne dla typów skierowań
// ─────────────────────────────────────────────────────────────

export interface DiagnosisInput {
  readonly icd10Code: string;
  readonly icd10Name: string;
  /** Opis narracyjny rozpoznania (treść referencji z entry). */
  readonly description: string;
  readonly bodySide?: BodySide;
}

export interface ReferralDiagnoses {
  readonly main: DiagnosisInput;
  readonly secondary?: readonly DiagnosisInput[];
}

export function buildDiagnosesSection(diagnoses: ReferralDiagnoses): CdaSection {
  const all = [diagnoses.main, ...(diagnoses.secondary ?? [])];
  const contentId = (index: number): string => `OBS_${index + 1}`;

  return {
    templateId: { "@root": COMMON_TEMPLATE.DIAGNOSES_SECTION },
    code: loinc(DIAGNOSIS_LOINC, "Diagnosis"),
    title: "Rozpoznania",
    text: {
      paragraph: {
        caption: "Rozpoznania wg ICD-10:",
        content: all.map((diagnosis, index) => ({
          "@ID": contentId(index),
          "#": `${diagnosis.icd10Code} ${diagnosis.description}`,
        })),
      },
    },
    entry: all.map((diagnosis, index) =>
      buildDiagnosisEntry(diagnosis, contentId(index), index === 0),
    ),
  };
}

function buildDiagnosisEntry(
  diagnosis: DiagnosisInput,
  contentId: string,
  isMain: boolean,
): Record<string, unknown> {
  const snomed = isMain ? SNOMED_CODE.PRINCIPAL_DIAGNOSIS : SNOMED_CODE.SECONDARY_DIAGNOSIS;
  const templateRoot = isMain
    ? COMMON_TEMPLATE.MAIN_DIAGNOSIS_ENTRY
    : COMMON_TEMPLATE.SECONDARY_DIAGNOSIS_ENTRY;

  const observation: Record<string, unknown> = {
    "@classCode": "OBS",
    "@moodCode": "EVN",
    code: {
      "@code": diagnosis.icd10Code,
      "@codeSystem": CDA_OID.ICD10,
      "@codeSystemName": "icd10",
      "@displayName": diagnosis.icd10Name,
    },
    text: { reference: { "@value": `#${contentId}` } },
  };
  if (diagnosis.bodySide) {
    const side = BODY_SIDE[diagnosis.bodySide];
    observation.targetSiteCode = {
      "@code": side.code,
      "@codeSystem": CDA_OID.SNOMED_CT,
      "@codeSystemName": "SNOMED CT",
      "@displayName": side.display,
    };
  }

  return {
    templateId: { "@root": templateRoot },
    organizer: {
      "@classCode": "BATTERY",
      "@moodCode": "EVN",
      code: {
        "@code": snomed.code,
        "@codeSystem": CDA_OID.SNOMED_CT,
        "@codeSystemName": "SNOMED CT",
        "@displayName": snomed.display,
      },
      statusCode: { "@code": "completed" },
      component: { observation },
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Załączniki — wspólne dla typów skierowań
// ─────────────────────────────────────────────────────────────

export interface Attachment {
  readonly idRoot: string;
  readonly idExtension: string;
  readonly loincCode: string;
  readonly loincDisplay: string;
  /** Kod klasy dokumentu P1 (np. "06.10"). */
  readonly p1ClassCode: string;
  readonly p1ClassDisplay: string;
  readonly description: string;
  /** Dokument zeskanowany — używa szablonu EXTERNAL_DOCUMENT_SCAN i pomija setId. */
  readonly isScan?: boolean;
  readonly setIdRoot?: string;
  readonly setIdExtension?: string;
  readonly versionNumber?: number;
}

export function buildAttachmentsSection(attachments: readonly Attachment[]): CdaSection {
  const attachmentId = (index: number): string => `ZAL_${index + 1}`;
  return {
    templateId: { "@root": COMMON_TEMPLATE.ATTACHMENTS_SECTION },
    title: "Załączniki",
    text: {
      list: {
        item: attachments.map((attachment, index) => ({
          "@ID": attachmentId(index),
          "#": attachment.description,
        })),
      },
    },
    entry: {
      organizer: {
        "@classCode": "CLUSTER",
        "@moodCode": "EVN",
        templateId: { "@root": COMMON_TEMPLATE.ATTACHMENT_ORGANIZER_ENTRY },
        statusCode: { "@code": "completed" },
        reference: attachments.map((attachment, index) =>
          buildAttachmentReference(attachment, attachmentId(index)),
        ),
      },
    },
  };
}

function buildAttachmentReference(
  attachment: Attachment,
  attachmentId: string,
): Record<string, unknown> {
  const externalDocTemplate = attachment.isScan
    ? COMMON_TEMPLATE.EXTERNAL_DOCUMENT_SCAN
    : COMMON_TEMPLATE.EXTERNAL_DOCUMENT;

  const externalDocument: Record<string, unknown> = {
    "@classCode": "DOC",
    "@moodCode": "EVN",
    templateId: { "@root": externalDocTemplate },
    id: { "@extension": attachment.idExtension, "@root": attachment.idRoot },
    code: {
      "@code": attachment.loincCode,
      "@codeSystem": CDA_OID.LOINC,
      "@codeSystemName": "LOINC",
      "@displayName": attachment.loincDisplay,
      translation: {
        "@code": attachment.p1ClassCode,
        "@codeSystem": CDA_OID.DOC_CLASS_P1,
        "@codeSystemName": "Klasa dokumentów P1",
        "@displayName": attachment.p1ClassDisplay,
      },
    },
    text: { reference: { "@value": `#${attachmentId}` } },
  };

  if (attachment.setIdRoot && attachment.setIdExtension) {
    externalDocument.setId = {
      "@extension": attachment.setIdExtension,
      "@root": attachment.setIdRoot,
    };
  } else if (!attachment.isScan) {
    externalDocument.setId = { "@nullFlavor": "NA" };
  }
  externalDocument.versionNumber =
    attachment.versionNumber !== undefined
      ? { "@value": String(attachment.versionNumber) }
      : { "@nullFlavor": "NA" };

  return {
    "@typeCode": "REFR",
    templateId: { "@root": COMMON_TEMPLATE.ATTACHMENT_REFERENCE_ENTRY },
    seperatableInd: { "@value": "false" },
    externalDocument,
  };
}
