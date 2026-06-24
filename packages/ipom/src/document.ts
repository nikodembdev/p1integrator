import { create } from "xmlbuilder2";
import { CDA_OID, formatCdaDateTime, generateDocumentId, type XmlObject } from "@p1/cda";
import {
  CONTROL_VISIT_OID,
  CONTROL_VISIT_VALUES,
  GS1_OID,
  HL7_ACT_OID,
  IPOM_CODE,
  IPOM_DOC_TEMPLATE,
  IPOM_ID_SEGMENT,
  IPOM_IG_VERSION,
  IPOM_SECTION,
  IPOM_SETID_SEGMENT,
  IPOM_TEMPLATE,
  LOINC_CODE,
  SPECIALIST_VALUES,
  SPECJALISTA_IPOM_OID,
  STRATIFICATION_OID,
  STRATIFICATION_VALUES,
  TEST_SCHEDULE_OID,
} from "./constants.js";
import { buildIpomHeader, ipomAttributeCode, loincCode } from "./header.js";
import type {
  IpomControlVisit,
  IpomDiagnosis,
  IpomDiagnosticTest,
  IpomEducation,
  IpomHealthStatus,
  IpomInput,
  IpomMedication,
  IpomResult,
  IpomSpecialistVisit,
} from "./types.js";

/**
 * Builder dokumentu IPOM (Indywidualny Plan Opieki Medycznej, plCdaIndividualMedicalCarePlan,
 * CDA PL IG 1.3.2.1). Nagłówek IPOM różni się od generycznego `buildClinicalDocument`
 * (recordTarget `.2.3` z `providerOrganization`, autor `.2.4` bez specjalności,
 * `representedOrganization` `.2.17` z id miejsca pracy na root `.2.3.2`, brak
 * document-level `participant`, wrapper `structuredBody` `.2.107`), więc to
 * dedykowany builder - wzorowany na oficjalnym `plan_opieki_medycznej-1.3.2.1.xml`.
 *
 * Sekcje wymagane (Schematron): status zdrowotny (.174), rozpoznania (.175),
 * porada edukacyjna (.177), wizyty kontrolne (.180). Opcjonalne: farmakoterapia
 * (.176), zaplanowane badania (.178), wizyty specjalistyczne (.179).
 */
export function buildIpomCda(input: IpomInput): IpomResult {
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
      docTemplate: IPOM_DOC_TEMPLATE,
      igVersion: IPOM_IG_VERSION,
      idSegment: IPOM_ID_SEGMENT,
      setIdSegment: IPOM_SETID_SEGMENT,
      translationCode: "00.94",
      translationDisplay: "Indywidualny Plan Opieki Medycznej",
      title: "Indywidualny Plan Opieki Medycznej",
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
  component.ele("templateId", { root: IPOM_TEMPLATE.STRUCTURED_BODY });
  const structuredBody = component.ele("structuredBody", {
    classCode: "DOCBODY",
    moodCode: "EVN",
  });
  for (const section of buildSections(input)) {
    structuredBody.ele({ component: section });
  }

  return { xml: root.end({ prettyPrint: true }), documentId, documentDate };
}

// --- Sekcje kliniczne -------------------------------------------------------

function buildSections(input: IpomInput): XmlObject[] {
  const sections: XmlObject[] = [
    buildHealthStatusSection(input.healthStatus),
    buildDiagnosesSection(input.diagnoses),
  ];
  if (input.medications && input.medications.length > 0) {
    sections.push(buildPharmacotherapySection(input.medications));
  }
  sections.push(buildEducationSection(input.education));
  if (input.diagnosticTests && input.diagnosticTests.length > 0) {
    sections.push(buildDiagnosticTestsSection(input.diagnosticTests));
  }
  sections.push(buildControlVisitsSection(input.controlVisits));
  if (input.specialistVisits && input.specialistVisits.length > 0) {
    sections.push(buildSpecialistVisitsSection(input.specialistVisits));
  }
  return sections;
}

/** Sekcja „Status zdrowotny pacjenta" (.3.174) - data oceny (DWOSP) + stratyfikacja (SOPS). */
export function buildHealthStatusSection(status: IpomHealthStatus): XmlObject {
  const stratLabel = status.stratificationLabel ?? STRATIFICATION_VALUES[status.stratification];
  const paragraphs: XmlObject[] = [
    {
      "@ID": "OBS_SZP_DWOSP",
      caption: {
        "@ID": "p1_dataWykonaniaOceny_nagowek",
        "@styleCode": "Bold",
        "#": "Data wykonania oceny stanu pacjenta i wydania zaleceń (określenie IPOM):",
      },
      content: {
        "@ID": "p1_dataWykonaniaOceny_wartosc",
        "#": status.assessmentDateLabel ?? status.assessmentDate,
      },
    },
    {
      "@ID": "OBS_SZP_SO",
      caption: {
        "@ID": "p1_stanOgolnyStratyfikacja_naglowek",
        "@styleCode": "Bold",
        "#": "Stan ogólny:",
      },
      br: {},
      content: [
        { "@ID": "p1_stanOgolnyStratyfikacja_etykieta", "#": "Stratyfikacja poziom:" },
        { "@ID": "p1_stanOgolnyStratyfikacja_wartosc", "#": stratLabel },
      ],
    },
  ];
  if (status.summary) {
    paragraphs.push({
      caption: {
        "@ID": "p1_stanPacjentaPodsumowanie_etykieta",
        "@styleCode": "Bold",
        "#": "Podsumowanie/komentarz:",
      },
      content: { "@ID": "p1_stanPacjentaPodsumowanie_wartosc", "#": status.summary },
    });
  }

  return {
    section: {
      templateId: { "@root": IPOM_SECTION.HEALTH_STATUS },
      code: loincCode("11323-3", "General health - Reported"),
      title: "Status zdrowotny pacjenta",
      text: { paragraph: paragraphs },
      entry: [
        {
          "@typeCode": "COMP",
          observation: {
            "@classCode": "OBS",
            "@moodCode": "EVN",
            code: ipomAttributeCode(IPOM_CODE.ASSESSMENT_DATE),
            text: { reference: { "@value": "#OBS_SZP_DWOSP" } },
            statusCode: { "@code": "completed" },
            effectiveTime: { "@value": status.assessmentDate },
          },
        },
        {
          "@typeCode": "COMP",
          observation: {
            "@classCode": "OBS",
            "@moodCode": "EVN",
            code: ipomAttributeCode(IPOM_CODE.STRATIFICATION),
            text: { reference: { "@value": "#OBS_SZP_SO" } },
            statusCode: { "@code": "completed" },
            value: {
              "@xsi:type": "CD",
              "@code": status.stratification,
              "@codeSystem": STRATIFICATION_OID,
              "@codeSystemName": "KodStratyfikacjiStanuPacjenta",
              "@displayName": stratLabel,
            },
          },
        },
      ],
    },
  };
}

/** Sekcja „Rozpoznania" (.3.175) - rozpoznania ICD-10. */
export function buildDiagnosesSection(diagnoses: readonly IpomDiagnosis[]): XmlObject {
  const paragraphs = diagnoses.map((d, i) => ({
    "@ID": `OBS_ROZP_${i + 1}`,
    content: [
      { "@ID": `p1_rozpoznanie_icd10_opis_${i + 1}`, "#": "ICD10:" },
      { "@ID": `p1_rozpoznanie_icd10_kod_${i + 1}`, "#": d.code },
      { "@ID": `p1_rozpoznanie_icd10_tekst_${i + 1}`, "#": d.name },
    ],
  }));
  const entries = diagnoses.map((d, i) => ({
    "@typeCode": "COMP",
    observation: {
      "@classCode": "OBS",
      "@moodCode": "EVN",
      code: loincCode(LOINC_CODE.DIAGNOSIS.code, LOINC_CODE.DIAGNOSIS.display),
      text: { reference: { "@value": `#OBS_ROZP_${i + 1}` } },
      statusCode: { "@code": "completed" },
      value: {
        "@xsi:type": "CD",
        "@code": d.code,
        "@codeSystem": CDA_OID.ICD10,
        "@codeSystemName": "icd-10",
        "@displayName": d.name,
      },
    },
  }));

  return {
    section: {
      templateId: { "@root": IPOM_SECTION.DIAGNOSES },
      code: loincCode("29548-5", "Diagnosis"),
      title: "Rozpoznania",
      text: { paragraph: paragraphs },
      entry: entries,
    },
  };
}

/** Sekcja „Farmakoterapia" (.3.176) - leki z dawkowaniem i okresem przyjmowania. */
export function buildPharmacotherapySection(medications: readonly IpomMedication[]): XmlObject {
  const rows = medications.map((m, i) => ({
    "@ID": `SBADM_${i + 1}`,
    td: [
      { "@ID": `p1_nazwaLekuG_${i + 1}`, "#": m.displayName ?? m.name },
      { "@ID": `p1_stosowanieLekuG_${i + 1}`, "#": m.dosage },
      { "@ID": `p1_okresStosowaniaLekuG_${i + 1}`, "#": m.duration },
    ],
  }));
  const entries = medications.map((m, i) => ({
    substanceAdministration: {
      "@classCode": "SBADM",
      "@moodCode": "INT",
      code: { "@code": "DRUG", "@codeSystem": HL7_ACT_OID, "@displayName": "Drug" },
      text: { reference: { "@value": `#SBADM_${i + 1}` } },
      statusCode: { "@code": "completed" },
      consumable: {
        manufacturedProduct: {
          manufacturedLabeledDrug: {
            code: {
              "@code": m.gtin,
              "@codeSystem": GS1_OID,
              "@codeSystemName": "GS1",
              "@displayName": m.displayName ?? m.name,
            },
            name: m.displayName ?? m.name,
          },
        },
      },
      entryRelationship: [
        observationStringEntry(LOINC_CODE.MEDICATION_DOSE, m.dosage),
        observationStringEntry(LOINC_CODE.DATE_LAST_DOSE, m.duration),
      ],
    },
  }));

  return {
    section: {
      templateId: { "@root": IPOM_SECTION.PHARMACOTHERAPY },
      code: loincCode("93341-6", "Medication recommendation"),
      title: "Farmakoterapia",
      text: {
        table: {
          thead: {
            tr: {
              th: ["Nazwa produktu leczniczego i dawka", "Ile razy dziennie", "Okres przyjmowania"],
            },
          },
          tbody: { tr: rows },
        },
      },
      entry: entries,
    },
  };
}

/** entryRelationship COMP z obserwacją LOINC i wartością tekstową (dawka/okres). */
function observationStringEntry(
  loinc: { code: string; display: string },
  value: string,
): XmlObject {
  return {
    "@typeCode": "COMP",
    observation: {
      "@classCode": "OBS",
      "@moodCode": "RQO",
      code: loincCode(loinc.code, loinc.display),
      statusCode: { "@code": "completed" },
      value: { "@xsi:type": "ST", "#": value },
    },
  };
}

/**
 * Sekcja „Porada edukacyjna, zalecenia i postępowanie niefarmakologiczne" (.3.177) -
 * liczby porad (LPDIET/LPPIEL, value INT) i opcjonalne inne zalecenia (INNZAL).
 */
function buildEducationSection(education: IpomEducation): XmlObject {
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
    intObservationEntry(IPOM_CODE.DIETARY_COUNT, education.dietaryCount, "#OBS_POR_LPDIET"),
    intObservationEntry(IPOM_CODE.NURSING_COUNT, education.nursingCount, "#OBS_POR_LPPIEL"),
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
      templateId: { "@root": IPOM_SECTION.EDUCATION },
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

/** entry COMP z obserwacją atrybutu IPOM i wartością całkowitą (value INT). */
function intObservationEntry(
  attr: { code: string; display: string },
  value: number,
  referenceId: string,
): XmlObject {
  return {
    "@typeCode": "COMP",
    observation: {
      "@classCode": "OBS",
      "@moodCode": "RQO",
      code: ipomAttributeCode(attr),
      text: { reference: { "@value": referenceId } },
      statusCode: { "@code": "completed" },
      value: { "@xsi:type": "INT", "@value": String(value) },
    },
  };
}

/** Sekcja „Zaplanowane badania diagnostyczne" (.3.178) - zlecenia ICD-9 PL z terminem (ZOWB). */
function buildDiagnosticTestsSection(tests: readonly IpomDiagnosticTest[]): XmlObject {
  const groups: { kind: IpomDiagnosticTest["kind"]; caption: string; prefix: string }[] = [
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
      entries.push(diagnosticTestEntry(t, `${group.prefix}_${i + 1}`));
    }
  }

  return {
    section: {
      templateId: { "@root": IPOM_SECTION.DIAGNOSTIC_TESTS },
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

function diagnosticTestEntry(test: IpomDiagnosticTest, referenceId: string): XmlObject {
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
      entryRelationship: buildTestScheduleRelationship(test),
    },
  };
}

/** entryRelationship ZOWB (rodzaj terminu + ewentualnie PIVL_TS/PQ/effectiveTime). */
export function buildTestScheduleRelationship(test: IpomDiagnosticTest): XmlObject {
  const { schedule } = test;
  const observation: XmlObject = {
    "@classCode": "OBS",
    "@moodCode": "RQO",
    code: ipomAttributeCode(IPOM_CODE.TEST_SCHEDULE),
    statusCode: { "@code": "completed" },
  };
  // Dla DOCZASU data graniczna (effectiveTime) poprzedza kod rodzaju (zgodnie ze wzorcem).
  if (schedule.kind === "DOCZASU" && schedule.date) {
    observation.effectiveTime = { "@value": schedule.date };
  }
  const value: XmlObject[] = [scheduleKindValue(schedule.kind)];
  if (schedule.kind === "INTERWAL" && schedule.period) {
    value.push({
      "@xsi:type": "PIVL_TS",
      period: { "@value": schedule.period.value, "@unit": schedule.period.unit },
    });
  }
  if ((schedule.kind === "CZASPRZEDWIZ" || schedule.kind === "CZASPOWIZ") && schedule.quantity) {
    value.push({
      "@xsi:type": "PQ",
      "@value": schedule.quantity.value,
      "@unit": schedule.quantity.unit,
    });
  }
  observation.value = value;
  return { "@typeCode": "COMP", observation };
}

export function scheduleKindValue(kind: IpomDiagnosticTest["schedule"]["kind"]): XmlObject {
  return {
    "@xsi:type": "CD",
    "@code": kind,
    "@codeSystem": TEST_SCHEDULE_OID,
    "@codeSystemName": "RodzajTerminuZleconegoBadania",
  };
}

/** Sekcja „Wizyty kontrolne" (.3.180) - zalecane terminy wizyt kontrolnych (ZOWK). */
function buildControlVisitsSection(visits: readonly IpomControlVisit[]): XmlObject {
  const rows = visits.map((v, i) => ({
    "@ID": `WIZKON_${i + 1}`,
    td: ["Wizyta kontrolna", v.planLabel],
  }));
  const entries = visits.map((v, i) => buildControlVisitEntry(v, `WIZKON_${i + 1}`));

  return {
    section: {
      templateId: { "@root": IPOM_SECTION.CONTROL_VISITS },
      code: {
        ...loincCode("48767-8", "Annotation comment [Interpretation] Narrative"),
        translation: ipomAttributeCode(IPOM_CODE.CONTROL_VISITS_SECTION),
      },
      title: "Wizyty kontrolne",
      text: {
        table: {
          thead: { tr: { th: ["Wizyta", "Plan"] } },
          tbody: { tr: rows },
        },
      },
      entry: entries,
    },
  };
}

function buildControlVisitEntry(visit: IpomControlVisit, referenceId: string): XmlObject {
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
  if (visit.kind === "POWYKZLECZADAN" && visit.requiredTasks) {
    observation.entryRelationship = {
      "@typeCode": "COMP",
      observation: {
        "@classCode": "OBS",
        "@moodCode": "INT",
        code: ipomAttributeCode(IPOM_CODE.REQUIRED_TASKS),
        statusCode: { "@code": "completed" },
        value: { "@xsi:type": "ST", "#": visit.requiredTasks },
      },
    };
  }
  return { "@typeCode": "COMP", observation };
}

/** Sekcja „Wizyty specjalistyczne" (.3.179) - wymagane wizyty specjalisty (ZKON + BL). */
function buildSpecialistVisitsSection(visits: readonly IpomSpecialistVisit[]): XmlObject {
  const rows = visits.map((v) => ({
    "@ID": `OBS_WIZ_${v.specialist}`,
    td: [v.specialistLabel ?? SPECIALIST_VALUES[v.specialist], v.required ? "TAK" : "NIE"],
  }));
  const entries = visits.map((v) => ({
    "@typeCode": "COMP",
    observation: {
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
    },
  }));

  return {
    section: {
      templateId: { "@root": IPOM_SECTION.SPECIALIST_VISITS },
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
