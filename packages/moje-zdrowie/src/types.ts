import type { SGOA_USER_ROLES } from "./constants.js";

/** Rola użytkownika w assertion JWT (`user_role`). */
export type SgoaUserRole = (typeof SGOA_USER_ROLES)[number];

/** Status realizacji ankiety (słownik PLSGOASurveyStatus, wartości wire P1). */
export type SurveyStatus =
  | "wypelniona"
  | "anulowana"
  | "w_realizacji"
  | "oczekujaca_na_podsumowanie"
  | "zrealizowana";

/** Status FHIR odpowiedzi na ankietę (profil dopuszcza tylko te dwa). */
export type SurveyResponseStatus = "completed" | "entered-in-error";

/** Status zakresu badań (CarePlan). `entered-in-error` ustawia wyłącznie system (anulowanie ankiety). */
export type ExamPlanStatus = "draft" | "active" | "on-hold" | "completed" | "entered-in-error";

/** Rodzaj badania w zakresie badań (słownik PLSGOAProcedureType). */
export type ProcedureType = "podstawowe" | "rozszerzone";

/** Kanał utworzenia/modyfikacji zasobu (słownik PLSGOASurveyEntryChannels). */
export type EntryChannel =
  | "mikp"
  | "mikp_pelnomocnik"
  | "ikp"
  | "ikp_pelnomocnik"
  | "gabinet_poz"
  | "gabinet"
  | "podmiot_zew_poz"
  | "podmiot_zew"
  | "system";

/** Typ wpisu historii modyfikacji (słownik PLSGOAModificationType). */
export type ModificationType =
  | "utworzenie"
  | "aktualizacja_odpowiedzi"
  | "aktualizacja_poz"
  | "podjecie_realizacji"
  | "wycofanie_realizacji"
  | "rozpoczecie_oczekiwania_na_wizyte_podsumowujaca"
  | "zakonczenie_realizacji"
  | "wycofanie_do_realizacji_badan"
  | "wycofanie_do_oczekiwania_na_wizyte_podsumowujaca"
  | "anulowanie"
  | "wycofanie_anulowania"
  | "anulowanie_administracyjne"
  | "wycofanie_anulowania_administracyjnego";

/** Wpis historii modyfikacji zasobu (extension PLSGOAModificationHistory/entry). */
export interface ModificationHistoryEntry {
  /** Kanał operacji (np. `ikp`, `gabinet_poz`, `podmiot_zew`). */
  readonly channel?: EntryChannel | (string & {});
  /** Typ operacji (np. `utworzenie`, `podjecie_realizacji`). */
  readonly type?: ModificationType | (string & {});
  /** Numer wersji zasobu po operacji. */
  readonly version?: string;
  /** Data i czas operacji (ISO 8601). */
  readonly date?: string;
  /** Miejsce udzielania świadczeń, które wykonało operację (`system|value`). */
  readonly locationId?: { readonly system?: string; readonly value?: string };
}

/**
 * Wartość odpowiedzi na pytanie ankiety (SGO-A: boolean/decimal/integer/choice/string).
 * Goły `number` mapuje się na `valueInteger` gdy całkowity, inaczej `valueDecimal`;
 * formy `{ decimal }`/`{ integer }` wymuszają typ FHIR (np. `{ decimal: 24 }`).
 */
export type SurveyAnswerValue =
  | boolean
  | number
  | string
  | { readonly decimal: number }
  | { readonly integer: number };

/* -------------------------------------------------------------------------- */
/* Definicja ankiety (Questionnaire - tylko do odczytu)                        */
/* -------------------------------------------------------------------------- */

/** Opcja odpowiedzi pytania jednokrotnego wyboru. */
export interface SurveyAnswerOption {
  /** Wartość przesyłana w odpowiedzi (`answerOption.valueString`). */
  readonly value: string;
  /** Etykieta do prezentacji (extension PLSGOAAnswerOptionDisplay; podlega tłumaczeniu). */
  readonly display?: string;
  /** Czy opcja jest domyślnie zaznaczona. */
  readonly initialSelected?: boolean;
}

/** Pytanie/grupa w definicji ankiety (drzewo `Questionnaire.item`). */
export interface SurveyDefinitionItem {
  readonly linkId: string;
  readonly text?: string;
  /** Typ itemu: `group`/`boolean`/`decimal`/`integer`/`choice`/`string`. */
  readonly type: string;
  readonly required?: boolean;
  readonly readOnly?: boolean;
  /** Warunki widoczności (surowe FHIR `enableWhen` - do interpretacji przez UI). */
  readonly enableWhen?: readonly Record<string, unknown>[];
  /** Jak łączyć wiele warunków `enableWhen`: wszystkie (`all`) czy dowolny (`any`). */
  readonly enableBehavior?: "all" | "any";
  readonly answerOptions?: readonly SurveyAnswerOption[];
  /** Podpowiedź (tooltip) do pytania. */
  readonly tooltip?: string;
  /** Ograniczenia wartości liczbowych (extensions minValue/maxValue). */
  readonly minValue?: number;
  readonly maxValue?: number;
  /** Sposób prezentacji (np. `bmi-scale`). */
  readonly itemControl?: string;
  /** Wyrażenie wyliczające wartość pola (MathJS/NSExpression). */
  readonly calculatedExpression?: string;
  /** Wyrażenie wyliczające wartość pola (FHIRPath, SDC) - to waliduje serwer (REG.16969). */
  readonly fhirPathExpression?: string;
  readonly items?: readonly SurveyDefinitionItem[];
}

/** Definicja ankiety (profil PLSGOAQuestionnaire). */
export interface SurveyDefinition {
  /** Identyfikator logiczny (np. `Moje-Zdrowie.2`). */
  readonly id?: string;
  /** Kanoniczny URL definicji - wpisywany do `QuestionnaireResponse.questionnaire`. */
  readonly url?: string;
  readonly version?: string;
  readonly title?: string;
  /** Opis ankiety (HTML). */
  readonly description?: string;
  /** Regulamin/polityka prywatności programu (HTML). */
  readonly purpose?: string;
  /** Kod programu (np. `moje_zdrowie`). */
  readonly programCode?: string;
  /** Początek okresu obowiązywania definicji. */
  readonly effectiveFrom?: string;
  /** Płeć, dla której definicja obowiązuje (`male`/`female`). */
  readonly gender?: string;
  /** Zakres wieku rocznikowego pacjenta. */
  readonly ageRange?: { readonly low?: number; readonly high?: number };
  readonly items: readonly SurveyDefinitionItem[];
  /** Surowy zasób FHIR (pełna definicja - np. do renderowania formularza). */
  readonly resource: unknown;
}

/* -------------------------------------------------------------------------- */
/* Ankieta pacjenta (QuestionnaireResponse)                                    */
/* -------------------------------------------------------------------------- */

/** Odpowiedź na pytanie/grupę przy wypełnianiu ankiety (drzewo `item`). */
export interface SurveyResponseItemInput {
  readonly linkId: string;
  /** Treść pytania - przepisana z definicji ankiety (wymagana przez profil). */
  readonly text: string;
  /** Wartości odpowiedzi (dla grup brak). */
  readonly answers?: readonly SurveyAnswerValue[];
  readonly items?: readonly SurveyResponseItemInput[];
}

/** Dane wejściowe zapisu ankiety pacjenta. */
export interface SurveyResponseInput {
  /** Kod programu profilaktycznego (domyślnie `moje_zdrowie`). */
  readonly programCode?: string;
  /** Data akceptacji polityki prywatności (ISO 8601 dateTime, wymagane). */
  readonly privacyPolicyAcceptanceDate: string;
  /** Kanoniczny URL definicji ankiety (np. `https://ezdrowie.gov.pl/fhir/Questionnaire/Moje-Zdrowie.2`). */
  readonly questionnaireUrl: string;
  /** Pacjent: PESEL + imiona i nazwisko (trafiają do `subject`). */
  readonly patient: {
    readonly pesel: string;
    readonly givenNames: readonly string[];
    readonly familyName: string;
  };
  readonly items: readonly SurveyResponseItemInput[];
}

/** Sparsowana odpowiedź na pytanie/grupę ankiety. */
export interface SurveyResponseItem {
  readonly linkId: string;
  readonly text?: string;
  readonly answers: readonly SurveyAnswerValue[];
  readonly items: readonly SurveyResponseItem[];
}

/** Ankieta pacjenta (profil PLSGOAQuestionnaireResponse) po sparsowaniu. */
export interface SurveyResponse {
  readonly id?: string;
  readonly status?: SurveyResponseStatus | (string & {});
  readonly programCode?: string;
  readonly privacyPolicyAcceptanceDate?: string;
  /** Kanoniczny URL definicji ankiety. */
  readonly questionnaireUrl?: string;
  readonly patientPesel?: string;
  /** Id powiązanego zakresu badań (z `basedOn` → `CarePlan/{id}`). */
  readonly examPlanId?: string;
  /** Status realizacji ankiety (wyliczany przez serwer). */
  readonly surveyStatus?: SurveyStatus | (string & {});
  /** Czy edycja ankiety jest zablokowana (realizacja podjęta przez POZ). */
  readonly locked: boolean;
  /** Czy to wersja archiwalna (tylko do odczytu dla tej placówki). */
  readonly archivalVersion: boolean;
  /** Powód anulowania (przy `status=entered-in-error`). */
  readonly cancelReason?: string;
  readonly modificationHistory: readonly ModificationHistoryEntry[];
  readonly items: readonly SurveyResponseItem[];
  /** Surowy zasób FHIR (podstawa do aktualizacji PUT-em). */
  readonly resource: unknown;
}

/* -------------------------------------------------------------------------- */
/* Zakres badań (CarePlan)                                                     */
/* -------------------------------------------------------------------------- */

/** Pojedyncze badanie w zakresie badań. */
export interface ExamPlanActivity {
  /** Kod badania (słownik `2.16.840.1.113883.3.4424.11.2.6`). */
  readonly code?: string;
  readonly display?: string;
  /** Rodzaj badania: `podstawowe`/`rozszerzone`. */
  readonly procedureType?: ProcedureType | (string & {});
  readonly description?: string;
  /** Status pozycji (w SGO-A stale `scheduled`). */
  readonly status?: string;
}

/** Zakres badań (profil PLSGOACarePlan) po sparsowaniu. */
export interface ExamPlan {
  readonly id?: string;
  readonly status?: ExamPlanStatus | (string & {});
  readonly programCode?: string;
  readonly patientPesel?: string;
  /** Data podjęcia realizacji (`period.start`; tylko poza statusem `draft`). */
  readonly startDate?: string;
  /** Informacje dla pacjenta (`note.text`). */
  readonly note?: string;
  readonly activities: readonly ExamPlanActivity[];
  readonly archivalVersion: boolean;
  readonly modificationHistory: readonly ModificationHistoryEntry[];
  /** Surowy zasób FHIR (podstawa do przejść statusów PUT-em). */
  readonly resource: unknown;
}

/* -------------------------------------------------------------------------- */
/* Wydruki i podsumowania                                                      */
/* -------------------------------------------------------------------------- */

/** Wydruk PDF (z PLSGOADocumentReference, po zdekodowaniu base64). */
export interface SurveyPdf {
  readonly pdf: Buffer;
  readonly contentType: string;
}

/** Podsumowanie strukturalne ankiety (profil PLSGOASurveySummary). */
export interface SurveySummary {
  readonly patientPesel?: string;
  readonly familyName?: string;
  readonly givenNames: readonly string[];
  readonly items: readonly SurveyResponseItem[];
  readonly resource: unknown;
}

/* -------------------------------------------------------------------------- */
/* Parametry wyszukiwania                                                      */
/* -------------------------------------------------------------------------- */

/** Wspólne parametry stronicowania/wyników. */
export interface SearchOptions {
  /** Liczba wyników na stronę (serwer domyślnie 50). */
  readonly count?: number;
  /** Sortowanie FHIR, np. `-_lastUpdated`, `-_id`. */
  readonly sort?: string;
  /** Czy zwrócić dokładną liczbę wszystkich trafień (`_total=accurate`). */
  readonly accurateTotal?: boolean;
}

/** Parametry wyszukiwania definicji ankiet. */
export interface SurveyDefinitionSearchParams extends SearchOptions {
  /** Kod programu (parametr `program-code`). */
  readonly programCode?: string;
  /** Wiek rocznikowy pacjenta (parametr `age`). */
  readonly age?: number;
  /** Płeć (`male`/`female`, parametr `gender`). */
  readonly gender?: string;
}

/** Parametry wyszukiwania ankiet pacjentów. */
export interface SurveyResponseSearchParams extends SearchOptions {
  /** Identyfikatory logiczne (`_id`, po przecinku). */
  readonly ids?: readonly string[];
  readonly programCode?: string;
  /** PESEL pacjenta (parametr `subject-identifier`). */
  readonly patientPesel?: string;
  /** Id miejsc udzielania świadczeń z aktywnych deklaracji POZ (parametr `subject-poz`). */
  readonly pozLocationId?: string;
  /** Id lekarza/pielęgniarki/położnej z deklaracji POZ (parametr `subject-poz-doctor`). */
  readonly pozPractitionerId?: string;
  /** Czy ankieta zablokowana do edycji (parametr `locked`). */
  readonly locked?: boolean;
  /** Status realizacji ankiety (parametr `survey-status`). */
  readonly surveyStatus?: SurveyStatus | (string & {});
  /** Data utworzenia - wartości FHIR date z prefiksami, np. `ge2026-01-01` (parametr `created`). */
  readonly created?: string | readonly string[];
  /** Dołącz powiązane zasoby: zakres badań i/lub definicję ankiety. */
  readonly include?: readonly ("exam-plan" | "questionnaire")[];
}

/** Parametry wyszukiwania zakresów badań. */
export interface ExamPlanSearchParams extends SearchOptions {
  readonly ids?: readonly string[];
  readonly programCode?: string;
  readonly patientPesel?: string;
  readonly pozLocationId?: string;
  readonly pozPractitionerId?: string;
  /** Data podjęcia realizacji - FHIR date z prefiksami (parametr `period-start`). */
  readonly periodStart?: string | readonly string[];
  /** Data utworzenia - FHIR date z prefiksami (parametr `created`). */
  readonly created?: string | readonly string[];
}

/** Strona wyników wyszukiwania. */
export interface SearchPage<T> {
  readonly items: readonly T[];
  /** Łączna liczba trafień (jeśli serwer ją zwrócił / `accurateTotal`). */
  readonly total?: number;
  /** URL następnej strony (`Bundle.link[relation=next]`) - do `nextPage`. */
  readonly nextUrl?: string;
  /** Surowy Bundle (m.in. zasoby dołączone przez `_include`). */
  readonly bundle: unknown;
}
