/** Stałe usługi Moje Zdrowie (SGO-A) - wg dokumentacji integracyjnej SGO-A (FHIR IG). */

/** Zakres (scope) tokenu OAuth2 dla serwera FHIR SGO-A. */
export const SGOA_FHIR_SCOPE = "https://ezdrowie.gov.pl/fhir-sgoa";

/** Kod programu profilaktycznego „Moje Zdrowie" (jedyny w słowniku SurveyType). */
export const MOJE_ZDROWIE_PROGRAM_CODE = "moje_zdrowie";

/** System identyfikatora pacjenta (PESEL) w zasobach SGO-A. */
export const SGOA_PESEL_SYSTEM = "urn:oid:2.16.840.1.113883.3.4424.1.1.616";

/** System kodów badań w zakresie badań (CarePlan.activity.detail.code). */
export const SGOA_EXAM_CODE_SYSTEM = "urn:oid:2.16.840.1.113883.3.4424.11.2.6";

/** Profile zasobów SGO-A (`meta.profile`). */
export const SGOA_PROFILE = {
  QUESTIONNAIRE: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAQuestionnaire",
  QUESTIONNAIRE_RESPONSE:
    "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAQuestionnaireResponse",
  CARE_PLAN: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOACarePlan",
  DOCUMENT_REFERENCE: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOADocumentReference",
  SURVEY_SUMMARY: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOASurveySummary",
} as const;

/** Rozszerzenia (extension) SGO-A. */
export const SGOA_EXT = {
  PROGRAM_CODE: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAProgramCode",
  PRIVACY_POLICY_ACCEPTANCE_DATE:
    "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAPrivacyPolicyAcceptanceDate",
  MODIFICATION_HISTORY:
    "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAModificationHistory",
  SURVEY_LOCK: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOASurveyLock",
  SURVEY_STATUS: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOASurveyStatus",
  CANCEL_REASON: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOACancelReason",
  ARCHIVAL_VERSION: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAArchivalVersion",
  DISPLAY_FAMILY_NAME:
    "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAReferenceDisplayFamilyName",
  DISPLAY_GIVEN_NAME:
    "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAReferenceDisplayGivenName",
  SURVEY_FAQ: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOASurveyFAQ",
  TOOLTIP: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOATooltip",
  CALCULATED_EXPRESSION:
    "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOACalculatedExpression",
  ANSWER_OPTION_DISPLAY:
    "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAAnswerOptionDisplay",
  QUESTIONNAIRE_ITEM_CONTROL:
    "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAQuestionnaireItemControl",
  /** Wyliczenie wg FHIRPath (SDC) - alternatywa dla PLSGOACalculatedExpression. */
  SDC_CALCULATED_EXPRESSION:
    "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression",
  /** Standardowe min/max dla itemów liczbowych. */
  MIN_VALUE: "http://hl7.org/fhir/StructureDefinition/minValue",
  MAX_VALUE: "http://hl7.org/fhir/StructureDefinition/maxValue",
} as const;

/** Systemy kodowania (CodeSystem) SGO-A. */
export const SGOA_CODE_SYSTEM = {
  SURVEY_TYPE: "https://ezdrowie.gov.pl/fhir/CodeSystem/PLSGOASurveyTypeCodeSystem",
  SURVEY_STATUS: "https://ezdrowie.gov.pl/fhir/CodeSystem/PLSGOASurveyStatusCodeSystem",
  ENTRY_CHANNEL: "https://ezdrowie.gov.pl/fhir/CodeSystem/PLSGOASurveyEntryChannelsCodeSystem",
  MODIFICATION_TYPE: "https://ezdrowie.gov.pl/fhir/CodeSystem/PLSGOAModificationTypeCodeSystem",
  PROCEDURE_TYPE: "https://ezdrowie.gov.pl/fhir/CodeSystem/PLSGOAProcedureTypeCodeSystem",
  ITEM_CONTROL: "https://ezdrowie.gov.pl/fhir/CodeSystem/PLSGOAQuestionnaireItemControlCodeSystem",
} as const;

/**
 * Role użytkownika w assertion JWT (`user_role`). Przy `ASYS` obowiązkowy jest
 * dodatkowo kontekst pracownika medycznego (`con` - patrz `assistantContext`
 * w `AccessTokenRequest` z `@p1/medical-events`).
 */
export const SGOA_USER_ROLES = [
  "LEK",
  "FEL",
  "LEKD",
  "PIEL",
  "POL",
  "ASYS",
  "PROF",
  "PROFILAKTYK",
] as const;

/**
 * Reguły biznesowe SGO-A (kody z OperationOutcome). Opisy skrótowe - pełne
 * brzmienia w dokumentacji przypadków użycia (use-case-*.html w IG).
 */
export const SGOA_RULE = {
  "REG.16928": "Dane pacjenta niezgodne z CWUb lub pacjent nie żyje",
  "REG.16966": "Wartość liczbowa odpowiedzi poza zakresem min/max",
  "REG.16969": "Pole wyliczane niezgodne z oczekiwaną wartością wyrażenia",
  "REG.16970": "Płeć pacjenta niezgodna z definicją ankiety",
  "REG.16972": "Wiek rocznikowy pacjenta poza zakresem definicji ankiety",
  "REG.16974": "Kod programu niezgodny z definicją ankiety",
  "REG.16975": "Ankieta w tym programie może być wypełniona tylko raz",
  "REG.16978": "Edycja ankiety zablokowana - realizacja podjęta przez POZ",
  "REG.16991": "Operacja dostępna tylko dla placówki realizującej zakres badań",
  "REG.16996": "Operacja dostępna tylko dla placówki POZ pacjenta",
  "REG.17247": "Karencja 12 miesięcy po udziale w programie Profilaktyka 40 PLUS",
  "REG.17429": "Anulowanie dostępne tylko dla aktywnego POZ pacjenta",
  "REG.17430": "Wycofać anulowanie może tylko placówka, która anulowała",
  "REG.17638": "Anulowanie zablokowane - realizacja podjęta przez POZ",
} as const;
