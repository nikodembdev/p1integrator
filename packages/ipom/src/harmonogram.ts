import { create } from "xmlbuilder2";
import { CDA_OID, formatCdaDateTime, generateDocumentId, type XmlObject } from "@p1/cda";
import {
  CONTROL_VISIT_OID,
  CONTROL_VISIT_VALUES,
  IPOM_CODE,
  IPOM_ID_SEGMENT,
  IPOM_SCHEDULE,
  IPOM_SCHEDULE_DOC_TEMPLATE,
  IPOM_SCHEDULE_ID_SEGMENT,
  IPOM_SCHEDULE_IG_VERSION,
  IPOM_SCHEDULE_SETID_SEGMENT,
  IPOM_SETID_SEGMENT,
  REALIZATION_OID,
  REALIZATION_VALUES,
  SPECIALIST_VALUES,
  SPECJALISTA_IPOM_OID,
} from "./constants.js";
import {
  buildDiagnosesSection,
  buildHealthStatusSection,
  buildPharmacotherapySection,
  buildTestScheduleRelationship,
} from "./document.js";
import { buildIpomHeader, ipomAttributeCode, loincCode } from "./header.js";
import type {
  IpomResult,
  IpomScheduleInput,
  ScheduleControlVisit,
  ScheduleDiagnosticTest,
  ScheduleEducation,
  ScheduleRealization,
  ScheduleSpecialistVisit,
} from "./types.js";

/**
 * Builder dokumentu harmonogramu IPOM (HIPOM, plCdaIndividualMedicalCarePlanSchedule,
 * CDA PL IG 1.3.2). Współdzieli nagłówek i sekcje stanu/rozpoznań/farmakoterapii
 * z planem; sekcje zleceń (porada `.182`, badania `.183`, wizyty kontrolne `.184`,
 * wizyty specjalistyczne `.185`) dodają status realizacji (SRZ), a sekcja
 * „Załączniki" (`.39`) odnosi się do dokumentu planu. Wzorzec:
 * `harmonogram-planu-opieki-medycznej-1.3.2.xml`.
 *
 * Sekcje wymagane (Schematron): status (.174), rozpoznania (.175), porada (.182),
 * wizyty kontrolne (.184), załączniki (.39). Opcjonalne: farmakoterapia (.176),
 * badania (.183), wizyty specjalistyczne (.185).
 */
export function buildIpomScheduleCda(input: IpomScheduleInput): IpomResult {
  const documentId = input.documentId ?? generateDocumentId();
  const documentSetId = input.documentSetId ?? documentId;
  const documentDate = input.documentDate ?? formatCdaDateTime(input.now ?? new Date());
  const versionNumber = input.versionNumber ?? 1;

  const root = create({ version: "1.0", encoding: "UTF-8" });
  root.ins("xml-stylesheet", 'href="CDA_PL_IG_1.3.2.xsl" type="text/xsl"');
  const clinicalDocument = root.ele("ClinicalDocument", {
    xmlns: "urn:hl7-org:v3",
    "xmlns:extPL": "http://www.csioz.gov.pl/xsd/extPL/r3",
    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
    "xsi:type": "extPL:ClinicalDocument",
  });

  clinicalDocument.ele(
    buildIpomHeader(input, {
      docTemplate: IPOM_SCHEDULE_DOC_TEMPLATE,
      igVersion: IPOM_SCHEDULE_IG_VERSION,
      idSegment: IPOM_SCHEDULE_ID_SEGMENT,
      setIdSegment: IPOM_SCHEDULE_SETID_SEGMENT,
      translationCode: "00.95",
      translationDisplay: "Indywidualny Plan Opieki Medycznej - Harmonogram",
      title: "Indywidualny Plan Opieki Medycznej - Harmonogram",
      documentId,
      documentSetId,
      documentDate,
      versionNumber,
    }),
  );

  const component = clinicalDocument.ele("component", {
    typeCode: "COMP",
    contextConductionInd: "true",
  });
  component.ele("templateId", { root: IPOM_SCHEDULE.STRUCTURED_BODY });
  const structuredBody = component.ele("structuredBody", { classCode: "DOCBODY", moodCode: "EVN" });
  for (const section of buildScheduleSections(input)) {
    structuredBody.ele({ component: section });
  }

  return { xml: root.end({ prettyPrint: true }), documentId, documentDate };
}

function buildScheduleSections(input: IpomScheduleInput): XmlObject[] {
  const sections: XmlObject[] = [
    buildHealthStatusSection(input.healthStatus),
    buildDiagnosesSection(input.diagnoses),
  ];
  if (input.medications && input.medications.length > 0) {
    sections.push(buildPharmacotherapySection(input.medications));
  }
  sections.push(buildEducationScheduleSection(input.education));
  if (input.diagnosticTests && input.diagnosticTests.length > 0) {
    sections.push(buildDiagnosticTestsScheduleSection(input.diagnosticTests));
  }
  sections.push(buildControlVisitsScheduleSection(input.controlVisits));
  if (input.specialistVisits && input.specialistVisits.length > 0) {
    sections.push(buildSpecialistVisitsScheduleSection(input.specialistVisits));
  }
  sections.push(buildAttachmentsSection(input));
  return sections;
}

/** entryRelationship COMP ze statusem realizacji zlecenia (SRZ). */
function srzRelationship(realization: ScheduleRealization): XmlObject {
  const observation: XmlObject = {
    "@classCode": "OBS",
    // EVN gdy zdarzenie się dokonało (z datą), INT gdy zamierzone (np. NZPL/ZPL bez daty).
    "@moodCode": realization.date ? "EVN" : "INT",
    code: ipomAttributeCode(IPOM_CODE.REALIZATION),
    statusCode: { "@code": "completed" },
  };
  if (realization.date) observation.effectiveTime = { "@value": realization.date };
  observation.value = {
    "@xsi:type": "CD",
    "@code": realization.status,
    "@codeSystem": REALIZATION_OID,
    "@codeSystemName": "StatusRealizacji",
    "@displayName": REALIZATION_VALUES[realization.status],
  };
  return { "@typeCode": "COMP", observation };
}

/**
 * Status realizacji jest obowiązkowy dla każdego zlecenia (reguła P1 REG.8923 i pokrewne).
 * Gdy nie podano realizacji, emituje pojedynczy SRZ `NZPL` („Nie zaplanowano").
 */
function srzRelationshipsRequired(realizations?: readonly ScheduleRealization[]): XmlObject[] {
  const list =
    realizations && realizations.length > 0 ? realizations : [{ status: "NZPL" as const }];
  return list.map(srzRelationship);
}

/** Sekcja „Porada edukacyjna..." (.3.182) - liczby porad (LPDIET/LPPIEL) + realizacje (SRZ). */
function buildEducationScheduleSection(education: ScheduleEducation): XmlObject {
  const rows: XmlObject[] = [
    { "@ID": "OBS_POR_LPDIET", td: ["1", "Edukacja dietetyczna", String(education.dietaryCount)] },
    {
      "@ID": "OBS_POR_LPPIEL",
      td: ["2", "Edukacja lekarska / pielęgniarska", String(education.nursingCount)],
    },
  ];
  const text: XmlObject = {
    table: {
      thead: { tr: { th: ["Lp.", "Obszar", "Liczba porad w roku"] } },
      tbody: { tr: rows },
    },
  };
  const entries: XmlObject[] = [
    intEntryWithRealizations(
      IPOM_CODE.DIETARY_COUNT,
      education.dietaryCount,
      "#OBS_POR_LPDIET",
      education.dietaryRealizations,
    ),
    intEntryWithRealizations(
      IPOM_CODE.NURSING_COUNT,
      education.nursingCount,
      "#OBS_POR_LPPIEL",
      education.nursingRealizations,
    ),
  ];
  if (education.otherRecommendations) {
    text.br = {};
    text.paragraph = {
      "@ID": "OBS_POR_INN",
      caption: { "@ID": "p1_inneZalecenia_naglowek", "@styleCode": "Bold", "#": "Inne zalecenia:" },
      br: {},
      content: { "@ID": "p1_inneZalecenia_wartosc", "#": education.otherRecommendations },
    };
    entries.push({
      "@typeCode": "COMP",
      observation: {
        "@classCode": "OBS",
        "@moodCode": "RQO",
        code: ipomAttributeCode(IPOM_CODE.OTHER_RECOMMENDATION),
        text: { reference: { "@value": "#OBS_POR_INN" } },
        statusCode: { "@code": "completed" },
        value: { "@xsi:type": "ST", "#": education.otherRecommendations },
      },
    });
  }

  return {
    section: {
      templateId: { "@root": IPOM_SCHEDULE.EDUCATION },
      code: {
        ...loincCode("48767-8", "Annotation comment [Interpretation] Narrative"),
        translation: ipomAttributeCode(IPOM_CODE.EDUCATION),
      },
      title: "Porada edukacyjna, zalecenia i postępowanie niefarmakologiczne",
      text,
      entry: entries,
    },
  };
}

function intEntryWithRealizations(
  attr: { code: string; display: string },
  value: number,
  referenceId: string,
  realizations?: readonly ScheduleRealization[],
): XmlObject {
  const observation: XmlObject = {
    "@classCode": "OBS",
    "@moodCode": "RQO",
    code: ipomAttributeCode(attr),
    text: { reference: { "@value": referenceId } },
    statusCode: { "@code": "completed" },
    value: { "@xsi:type": "INT", "@value": String(value) },
    entryRelationship: srzRelationshipsRequired(realizations),
  };
  return { "@typeCode": "COMP", observation };
}

/** Sekcja „Zaplanowane badania diagnostyczne" (.3.183) - zlecenia ICD-9 + ZOWB + realizacje. */
function buildDiagnosticTestsScheduleSection(tests: readonly ScheduleDiagnosticTest[]): XmlObject {
  const groups: { kind: ScheduleDiagnosticTest["kind"]; caption: string; prefix: string }[] = [
    { kind: "lab", caption: "Laboratoryjne", prefix: "OBS_ZB_LAB" },
    { kind: "imaging", caption: "Obrazowe", prefix: "OBS_ZB_OBR" },
    { kind: "other", caption: "Inne", prefix: "OBS_ZB_INN" },
  ];

  const narrativeItems: XmlObject[] = [];
  const entries: XmlObject[] = [];
  for (const group of groups) {
    const inGroup = tests.filter((t) => t.kind === group.kind);
    if (inGroup.length === 0) continue;
    narrativeItems.push({
      caption: { "@styleCode": "Bold", "#": group.caption },
      table: {
        thead: { tr: { th: ["Lp.", "Nazwa badania", "Interwał/moment wykonania badania"] } },
        tbody: {
          tr: inGroup.map((t, i) => ({
            "@ID": `${group.prefix}_${i + 1}`,
            td: [String(i + 1), t.name, t.schedule.label],
          })),
        },
      },
    });
    for (const [i, t] of inGroup.entries()) {
      entries.push(diagnosticTestScheduleEntry(t, `${group.prefix}_${i + 1}`));
    }
  }

  return {
    section: {
      templateId: { "@root": IPOM_SCHEDULE.DIAGNOSTIC_TESTS },
      code: {
        "@code": "165332000",
        "@codeSystem": CDA_OID.SNOMED_CT,
        "@codeSystemName": "SNOMED GPS",
        "@displayName": "Laboratory test requested",
      },
      title: "Zaplanowane badania diagnostyczne",
      text: { list: { item: narrativeItems } },
      entry: entries,
    },
  };
}

function diagnosticTestScheduleEntry(test: ScheduleDiagnosticTest, referenceId: string): XmlObject {
  const code =
    test.kind === "lab"
      ? IPOM_CODE.TEST_LAB
      : test.kind === "imaging"
        ? IPOM_CODE.TEST_IMAGING
        : IPOM_CODE.TEST_OTHER;
  return {
    "@typeCode": "COMP",
    observation: {
      "@classCode": "OBS",
      "@moodCode": "RQO",
      code: ipomAttributeCode(code),
      text: { reference: { "@value": `#${referenceId}` } },
      statusCode: { "@code": "completed" },
      value: {
        "@xsi:type": "CD",
        "@code": test.code,
        "@codeSystem": CDA_OID.ICD9_PL,
        "@codeSystemName": "ICD-9 PL",
        "@displayName": test.name,
      },
      entryRelationship: [
        buildTestScheduleRelationship(test),
        ...srzRelationshipsRequired(test.realizations),
      ],
    },
  };
}

/** Sekcja „Wizyty kontrolne" (.3.184) - terminy (ZOWK) + realizacje (SRZ). */
function buildControlVisitsScheduleSection(visits: readonly ScheduleControlVisit[]): XmlObject {
  const rows = visits.map((v, i) => ({
    "@ID": `WIZKON_${i + 1}`,
    td: ["Wizyta kontrolna", v.planLabel],
  }));
  const entries = visits.map((v, i) => buildControlVisitScheduleEntry(v, `WIZKON_${i + 1}`));

  return {
    section: {
      templateId: { "@root": IPOM_SCHEDULE.CONTROL_VISITS },
      code: {
        ...loincCode("48767-8", "Annotation comment [Interpretation] Narrative"),
        translation: ipomAttributeCode(IPOM_CODE.CONTROL_VISITS_SECTION),
      },
      title: "Wizyty kontrolne",
      text: { table: { thead: { tr: { th: ["Wizyta", "Plan"] } }, tbody: { tr: rows } } },
      entry: entries,
    },
  };
}

function buildControlVisitScheduleEntry(
  visit: ScheduleControlVisit,
  referenceId: string,
): XmlObject {
  const observation: XmlObject = {
    "@classCode": "OBS",
    "@moodCode": "RQO",
    code: ipomAttributeCode(IPOM_CODE.CONTROL_VISIT),
    text: { reference: { "@value": `#${referenceId}` } },
    statusCode: { "@code": "completed" },
  };
  const value: XmlObject[] = [
    {
      "@xsi:type": "CD",
      "@code": visit.kind,
      "@codeSystem": CONTROL_VISIT_OID,
      "@codeSystemName": "RodzajTerminuWizytyKontrolnej",
      "@displayName": CONTROL_VISIT_VALUES[visit.kind],
    },
  ];
  if (visit.kind === "POOKRCZASIE" && visit.quantity) {
    value.push({ "@xsi:type": "PQ", "@value": visit.quantity.value, "@unit": visit.quantity.unit });
  }
  if (visit.kind === "INTERWAL" && visit.period) {
    value.push({
      "@xsi:type": "PIVL_TS",
      period: { "@value": visit.period.value, "@unit": visit.period.unit },
    });
  }
  observation.value = value;
  const relationships: XmlObject[] = [];
  if (visit.kind === "POWYKZLECZADAN" && visit.requiredTasks) {
    relationships.push({
      "@typeCode": "COMP",
      observation: {
        "@classCode": "OBS",
        "@moodCode": "INT",
        code: ipomAttributeCode(IPOM_CODE.REQUIRED_TASKS),
        statusCode: { "@code": "completed" },
        value: { "@xsi:type": "ST", "#": visit.requiredTasks },
      },
    });
  }
  relationships.push(...srzRelationshipsRequired(visit.realizations));
  observation.entryRelationship = relationships;
  return { "@typeCode": "COMP", observation };
}

/** Sekcja „Wizyty specjalistyczne" (.3.185) - zlecenia (ZKON + BL) + realizacje (SRZ). */
function buildSpecialistVisitsScheduleSection(
  visits: readonly ScheduleSpecialistVisit[],
): XmlObject {
  const rows = visits.map((v) => ({
    "@ID": `OBS_WIZ_${v.specialist}`,
    td: [v.specialistLabel ?? SPECIALIST_VALUES[v.specialist], v.required ? "TAK" : "NIE"],
  }));
  const entries = visits.map((v) => {
    const observation: XmlObject = {
      "@classCode": "OBS",
      "@moodCode": "RQO",
      code: ipomAttributeCode(IPOM_CODE.CONSULTATION),
      text: { reference: { "@value": `#OBS_WIZ_${v.specialist}` } },
      statusCode: { "@code": "completed" },
      value: [
        {
          "@xsi:type": "CD",
          "@code": v.specialist,
          "@codeSystem": SPECJALISTA_IPOM_OID,
          "@codeSystemName": "SpecjalistaIPOM",
          "@displayName": v.specialistLabel ?? SPECIALIST_VALUES[v.specialist],
        },
        { "@xsi:type": "BL", "@value": String(v.required) },
      ],
      entryRelationship: srzRelationshipsRequired(v.realizations),
    };
    return { "@typeCode": "COMP", observation };
  });

  return {
    section: {
      templateId: { "@root": IPOM_SCHEDULE.SPECIALIST_VISITS },
      code: {
        ...loincCode("11487-6", "Consultation request (narrative)"),
        translation: ipomAttributeCode(IPOM_CODE.SPECIALIST_VISITS_SECTION),
      },
      title: "Wizyty specjalistyczne",
      text: {
        table: {
          thead: { tr: { th: ["Specjalista", "Wymagana konsultacja specjalisty"] } },
          tbody: { tr: rows },
        },
      },
      entry: entries,
    },
  };
}

/** Sekcja „Załączniki" (.3.39) - referencja organizer→externalDocument do dokumentu planu. */
function buildAttachmentsSection(input: IpomScheduleInput): XmlObject {
  const { localRoot, plan } = input;
  const planVersion = plan.versionNumber ?? 1;
  return {
    section: {
      templateId: { "@root": IPOM_SCHEDULE.ATTACHMENTS },
      title: "Załączniki",
      text: {
        paragraph: {
          "@ID": "IPOMDOC",
          caption: "Dokument IPOM, którego dotyczy harmonogram:",
          br: [{}, {}],
          content: [
            { "@styleCode": "Bold", "#": "Numer dokumentu: " },
            { "#": plan.documentId },
            { "@styleCode": "Bold", "#": "Numer wersji: " },
            { "#": String(planVersion) },
          ],
        },
      },
      entry: {
        organizer: {
          "@classCode": "CLUSTER",
          "@moodCode": "EVN",
          templateId: { "@root": IPOM_SCHEDULE.ATTACHMENT_ORGANIZER },
          statusCode: { "@code": "completed" },
          reference: {
            "@typeCode": "REFR",
            templateId: { "@root": IPOM_SCHEDULE.ATTACHMENT_REFERENCE },
            seperatableInd: { "@value": "false" },
            externalDocument: {
              templateId: { "@root": IPOM_SCHEDULE.ATTACHMENT_EXTERNAL_DOC },
              id: {
                "@extension": plan.documentId,
                "@root": `${localRoot}.${IPOM_ID_SEGMENT}`,
                "@displayable": "false",
              },
              code: {
                ...loincCode("18776-5", "Plan of care note"),
                translation: {
                  "@code": "00.94",
                  "@codeSystem": CDA_OID.DOC_CLASS_P1,
                  "@codeSystemName": "KLAS_DOK_P1",
                  "@displayName": "Indywidualny Plan Opieki Medycznej",
                },
              },
              text: { reference: { "@value": "#IPOMDOC" } },
              setId: {
                "@extension": plan.documentSetId,
                "@root": `${localRoot}.${IPOM_SETID_SEGMENT}`,
              },
              versionNumber: { "@value": String(planVersion) },
            },
          },
        },
      },
    },
  };
}
