/**
 * Fixtures do testów jednostkowych - skrócone kopie oficjalnych przykładów
 * z dokumentacji integracyjnej SGO-A (IG v28.3.2): Questionnaire-Moje-Zdrowie.2,
 * QuestionnaireResponse-odpowiedz-na-ankiete-*, CarePlan-zakres-badan-active,
 * DocumentReference-podsumowanie-ankiety.
 */

/** Definicja ankiety (fragment realnej `Moje-Zdrowie.2`). */
export const QUESTIONNAIRE_FIXTURE = {
  resourceType: "Questionnaire",
  id: "Moje-Zdrowie.2",
  meta: { profile: ["https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAQuestionnaire"] },
  url: "https://ezdrowie.gov.pl/fhir/Questionnaire/Moje-Zdrowie.2",
  version: "28.3.2",
  title: "Moje Zdrowie",
  status: "active",
  date: "2025-03-10",
  description: "<b>Opis ankiety</b>",
  purpose: "<b>Regulamin</b>",
  useContext: [
    {
      code: { system: "http://terminology.hl7.org/CodeSystem/usage-context-type", code: "gender" },
      valueCodeableConcept: {
        coding: [{ system: "http://hl7.org/fhir/administrative-gender", code: "male" }],
      },
    },
    {
      code: { system: "http://terminology.hl7.org/CodeSystem/usage-context-type", code: "age" },
      valueRange: { low: { value: 20 }, high: { value: 59 } },
    },
  ],
  effectivePeriod: { start: "2025-05-03" },
  code: [
    {
      system: "https://ezdrowie.gov.pl/fhir/CodeSystem/PLSGOASurveyTypeCodeSystem",
      code: "moje_zdrowie",
    },
  ],
  item: [
    {
      linkId: "dane-podstawowe",
      text: "Dane podstawowe",
      type: "group",
      item: [
        {
          extension: [
            { url: "http://hl7.org/fhir/StructureDefinition/minValue", valueInteger: 50 },
            { url: "http://hl7.org/fhir/StructureDefinition/maxValue", valueInteger: 250 },
          ],
          linkId: "wzrost",
          text: "Wzrost (cm)",
          type: "integer",
          required: true,
        },
        {
          extension: [
            {
              url: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOACalculatedExpression",
              valueString: "round({{masa-ciala}} / (({{wzrost}} / 100) * ({{wzrost}} / 100)), 1)",
            },
            {
              url: "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression",
              valueExpression: {
                description: "BMI Calculation",
                language: "text/fhirpath",
                expression: "((repeat(item).where(linkId='masa-ciala').answer.value.round(15)))",
              },
            },
            {
              url: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAQuestionnaireItemControl",
              valueCode: "bmi-scale",
            },
          ],
          linkId: "bmi",
          text: "BMI (wskaźnik masy ciała)",
          type: "decimal",
          required: true,
          readOnly: true,
        },
        {
          linkId: "wyksztalcenie",
          text: "Wykształcenie",
          type: "choice",
          required: true,
          answerOption: [
            {
              extension: [
                {
                  url: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAAnswerOptionDisplay",
                  valueString: "Podstawowe",
                },
              ],
              valueString: "Podstawowe",
            },
            {
              extension: [
                {
                  url: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAAnswerOptionDisplay",
                  valueString: "Wyższe",
                },
              ],
              valueString: "Wyższe",
            },
          ],
        },
      ],
    },
  ],
};

/** Ankieta pacjenta zwrócona przez serwer (wg oficjalnego przykładu response). */
export const SURVEY_RESPONSE_FIXTURE = {
  resourceType: "QuestionnaireResponse",
  id: "12345",
  meta: {
    profile: ["https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAQuestionnaireResponse"],
    versionId: "1",
  },
  extension: [
    {
      url: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAProgramCode",
      valueCode: "moje_zdrowie",
    },
    {
      url: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAPrivacyPolicyAcceptanceDate",
      valueDateTime: "2025-03-10T14:35:43.356+01:00",
    },
    {
      extension: [
        {
          extension: [
            { url: "channel", valueCode: "podmiot_zew" },
            { url: "version", valueString: "1" },
            { url: "date", valueDateTime: "2025-03-10T14:35:43.356+01:00" },
            { url: "type", valueCode: "utworzenie" },
            {
              url: "locationId",
              valueIdentifier: {
                system: "urn:oid:2.16.840.1.113883.3.4424.2.3.3",
                value: "00000001211-1",
              },
            },
          ],
          url: "entry",
        },
      ],
      url: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAModificationHistory",
    },
    {
      url: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOASurveyStatus",
      valueCoding: {
        system: "https://ezdrowie.gov.pl/fhir/CodeSystem/PLSGOASurveyStatusCodeSystem",
        code: "wypelniona",
        display: "Wypełniona",
      },
    },
  ],
  basedOn: [{ reference: "CarePlan/98765", type: "CarePlan" }],
  questionnaire: "https://ezdrowie.gov.pl/fhir/Questionnaire/Moje-Zdrowie.2",
  status: "completed",
  subject: {
    identifier: { system: "urn:oid:2.16.840.1.113883.3.4424.1.1.616", value: "90080517455" },
    _display: {
      extension: [
        {
          url: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAReferenceDisplayFamilyName",
          valueString: "Nowak",
        },
        {
          url: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAReferenceDisplayGivenName",
          valueString: "Bartosz",
        },
      ],
    },
  },
  item: [
    {
      linkId: "dane-podstawowe",
      text: "Dane podstawowe",
      item: [
        { linkId: "wzrost", text: "Wzrost (cm)", answer: [{ valueInteger: 185 }] },
        { linkId: "masa-ciala", text: "Masa ciała (kg)", answer: [{ valueDecimal: 85.2 }] },
        { linkId: "wyksztalcenie", text: "Wykształcenie", answer: [{ valueString: "Wyższe" }] },
      ],
    },
  ],
};

/** Zakres badań w realizacji (wg oficjalnego przykładu CarePlan-zakres-badan-active). */
export const EXAM_PLAN_FIXTURE = {
  resourceType: "CarePlan",
  id: "98765",
  meta: {
    profile: ["https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOACarePlan"],
    versionId: "2",
  },
  extension: [
    {
      url: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAProgramCode",
      valueCode: "moje_zdrowie",
    },
    {
      extension: [
        {
          extension: [
            { url: "channel", valueCode: "mikp" },
            { url: "version", valueString: "1" },
            { url: "date", valueDateTime: "2025-03-10T14:35:43.356+01:00" },
            { url: "type", valueCode: "utworzenie" },
          ],
          url: "entry",
        },
        {
          extension: [
            { url: "channel", valueCode: "gabinet_poz" },
            { url: "version", valueString: "2" },
            { url: "date", valueDateTime: "2025-03-12T14:35:43.356+01:00" },
            { url: "type", valueCode: "podjecie_realizacji" },
          ],
          url: "entry",
        },
      ],
      url: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAModificationHistory",
    },
  ],
  status: "active",
  intent: "plan",
  subject: {
    identifier: { system: "urn:oid:2.16.840.1.113883.3.4424.1.1.616", value: "90080517455" },
  },
  period: { start: "2025-03-12" },
  activity: [
    {
      detail: {
        code: {
          coding: [
            {
              system: "urn:oid:2.16.840.1.113883.3.4424.11.2.6",
              code: "C55",
              display: "[C55] Morfologia krwi, z pełnym różnicowaniem granulocytów",
            },
          ],
        },
        reasonCode: [
          {
            coding: [
              {
                system: "https://ezdrowie.gov.pl/fhir/CodeSystem/PLSGOAProcedureTypeCodeSystem",
                code: "podstawowe",
              },
            ],
          },
        ],
        status: "scheduled",
      },
    },
    {
      detail: {
        code: {
          coding: [
            {
              system: "urn:oid:2.16.840.1.113883.3.4424.11.2.6",
              code: "L43",
              display: "[L43] Glukoza z krwi żylnej",
            },
          ],
        },
        status: "scheduled",
      },
    },
  ],
  note: [{ text: "Id zlecenia: 1234" }],
};

/** Wydruk ankiety (PLSGOADocumentReference z PDF w base64). */
export const DOCUMENT_REFERENCE_FIXTURE = {
  resourceType: "DocumentReference",
  meta: { profile: ["https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOADocumentReference"] },
  status: "current",
  content: [
    {
      attachment: {
        contentType: "application/pdf",
        data: Buffer.from("%PDF-1.4 test", "utf8").toString("base64"),
      },
    },
  ],
};

/** OperationOutcome z regułą biznesową (kształt jak z serwera FHIR P1). */
export const OPERATION_OUTCOME_FIXTURE = {
  resourceType: "OperationOutcome",
  issue: [
    {
      severity: "error",
      code: "business-rule",
      diagnostics:
        "REG.16975: Ankieta w ramach programu moje_zdrowie może zostać wypełniona tylko raz",
    },
  ],
};
