import type { CdaAuthor, CdaLegalAuthenticator, CdaPatient } from "@p1/cda";

/**
 * Poziom stratyfikacji stanu ogólnego pacjenta (SOPS):
 * `S` - Stabilny, `P` - Pośredni, `Z` - Zagrożony niestabilnością.
 */
export type PatientStratification = "S" | "P" | "Z";

/** Sekcja „Status zdrowotny pacjenta" (.3.174) - wymagana. */
export interface IpomHealthStatus {
  /** Data wykonania oceny stanu pacjenta (DWOSP, YYYYMMDD); nie późniejsza niż data wystawienia. */
  readonly assessmentDate: string;
  /** Etykieta daty oceny w narracji (domyślnie `assessmentDate`). */
  readonly assessmentDateLabel?: string;
  /** Poziom stratyfikacji (kod słownika `KodStratyfikacjiStanuPacjenta`). */
  readonly stratification: PatientStratification;
  /** Etykieta poziomu w narracji (domyślnie nazwa słownikowa, np. „Stabilny"). */
  readonly stratificationLabel?: string;
  /** Podsumowanie/komentarz stanu pacjenta (narracja). */
  readonly summary?: string;
}

/** Pojedyncze rozpoznanie ICD-10 (sekcja „Rozpoznania", .3.175). */
export interface IpomDiagnosis {
  /** Kod ICD-10, np. „E11.0". */
  readonly code: string;
  /** Nazwa/opis rozpoznania, np. „Cukrzyca". */
  readonly name: string;
}

/** Pozycja farmakoterapii (sekcja „Farmakoterapia", .3.176). */
export interface IpomMedication {
  /**
   * Kod GTIN/EAN produktu (codeSystem GS1). Dla leku recepturowego podaj
   * `"0000000000000"` i czytelną `name` (np. „Lek recepturowy").
   */
  readonly gtin: string;
  /** Nazwa produktu (`manufacturedLabeledDrug/name`). */
  readonly name: string;
  /** Nazwa z dawką do narracji (domyślnie `name`), np. „Polocard 150mg". */
  readonly displayName?: string;
  /** Dawkowanie (LOINC „Medication dose"), np. „2x1". */
  readonly dosage: string;
  /** Okres przyjmowania (LOINC „Date last dose"), np. „przez 90 dni" / „bezterminowo". */
  readonly duration: string;
}

/**
 * Sekcja „Porada edukacyjna, zalecenia i postępowanie niefarmakologiczne" (.3.177) -
 * wymagana. Liczby porad (LPDIET/LPPIEL) są obowiązkowe; INNZAL opcjonalne.
 */
export interface IpomEducation {
  /** Liczba porad dietetycznych w roku (LPDIET, value INT). */
  readonly dietaryCount: number;
  /** Liczba porad lekarskich/pielęgniarskich w roku (LPPIEL, value INT). */
  readonly nursingCount: number;
  /** Inne zalecenia / postępowanie niefarmakologiczne (INNZAL, value ST). */
  readonly otherRecommendations?: string;
}

/** Rodzaj terminu zleconego badania (ZOWB, RodzajTerminuZleconegoBadania). */
export type TestScheduleKind =
  | "INTERWAL"
  | "NAJSZYB"
  | "CZASPOWIZ"
  | "DOCZASU"
  | "CZASPRZEDWIZ"
  | "PRZEDNASTWIZ";

/** Określenie terminu wykonania badania (ZOWB). */
export interface TestSchedule {
  readonly kind: TestScheduleKind;
  /** Zapis terminu w bloku narracyjnym, np. „Co 1 mies." / „Do 1.12.2022". */
  readonly label: string;
  /** Interwał (PIVL_TS) - dla `INTERWAL`, np. `{ value: "1", unit: "mo" }`. */
  readonly period?: { readonly value: string; readonly unit: string };
  /** Data graniczna (effectiveTime, YYYYMMDD) - dla `DOCZASU`. */
  readonly date?: string;
  /** Wielkość (PQ) - dla `CZASPRZEDWIZ`/`CZASPOWIZ`, np. `{ value: "1", unit: "mo" }`. */
  readonly quantity?: { readonly value: string; readonly unit: string };
}

/** Rodzaj zaplanowanego badania: laboratoryjne / obrazowe / inne (ZBLAB/ZBOBR/ZBINN). */
export type DiagnosticTestKind = "lab" | "imaging" | "other";

/** Zaplanowane badanie diagnostyczne (sekcja .3.178). */
export interface IpomDiagnosticTest {
  readonly kind: DiagnosticTestKind;
  /** Kod ICD-9 PL badania, np. „C55". */
  readonly code: string;
  /** Nazwa badania. */
  readonly name: string;
  /** Zalecany okres/termin wykonania badania (ZOWB). */
  readonly schedule: TestSchedule;
}

/** Rodzaj terminu wizyty kontrolnej (ZOWK, RodzajTerminuWizytyKontrolnej). */
export type ControlVisitKind = "POOKRCZASIE" | "INTERWAL" | "POWYKBADAN" | "POWYKZLECZADAN";

/** Zalecana wizyta kontrolna (sekcja „Wizyty kontrolne", .3.180) - wymagana, min 1. */
export interface IpomControlVisit {
  readonly kind: ControlVisitKind;
  /** Zapis planu wizyty w narracji, np. „Co 3 mies." / „Za 1 mies.". */
  readonly planLabel: string;
  /** Interwał (PIVL_TS) - dla `INTERWAL`. */
  readonly period?: { readonly value: string; readonly unit: string };
  /** Wielkość (PQ) - dla `POOKRCZASIE`, np. `{ value: "1", unit: "mo" }`. */
  readonly quantity?: { readonly value: string; readonly unit: string };
  /** Opis wymaganych zadań przed wizytą (OWZPW) - dla `POWYKZLECZADAN`. */
  readonly requiredTasks?: string;
}

/** Kod specjalisty IPOM (SpecjalistaIPOM). */
export type SpecialistCode = "KARDIO" | "ENDOKR" | "DIAEND" | "PULALE";

/** Wymagana wizyta specjalistyczna (sekcja „Wizyty specjalistyczne", .3.179). */
export interface IpomSpecialistVisit {
  /** Kod specjalisty (KARDIO/ENDOKR/DIAEND/PULALE). */
  readonly specialist: SpecialistCode;
  /** Etykieta specjalisty w narracji (domyślnie nazwa słownikowa). */
  readonly specialistLabel?: string;
  /** Czy wizyta jest wymagana (value BL: true=TAK, false=NIE). */
  readonly required: boolean;
}

/** Wejście buildera dokumentu IPOM (plan opieki medycznej). */
export interface IpomInput {
  /** Bazowy root lokalny podmiotu (`id_lokalne_podmiotu`); z niego .26.1/.26.2/.17.1. */
  readonly localRoot: string;
  readonly patient: CdaPatient;
  readonly author: CdaAuthor;
  readonly legalAuthenticator: CdaLegalAuthenticator;
  /**
   * Identyfikator podmiotu udostępniającego dane (`recordTarget/.../providerOrganization`,
   * root `.2.3.1`). Zwykle numer księgi RPWDL podmiotu.
   */
  readonly providerOrganizationId: string;

  /** Sekcja „Status zdrowotny pacjenta" (wymagana). */
  readonly healthStatus: IpomHealthStatus;
  /** Sekcja „Rozpoznania" - co najmniej jedno rozpoznanie (wymagana). */
  readonly diagnoses: readonly IpomDiagnosis[];
  /** Sekcja „Porada edukacyjna, zalecenia i postępowanie niefarmakologiczne" (wymagana). */
  readonly education: IpomEducation;
  /** Sekcja „Wizyty kontrolne" - co najmniej jedna (wymagana). */
  readonly controlVisits: readonly IpomControlVisit[];

  /** Sekcja „Farmakoterapia" (opcjonalna). */
  readonly medications?: readonly IpomMedication[];
  /** Sekcja „Zaplanowane badania diagnostyczne" (opcjonalna). */
  readonly diagnosticTests?: readonly IpomDiagnosticTest[];
  /** Sekcja „Wizyty specjalistyczne" (opcjonalna). */
  readonly specialistVisits?: readonly IpomSpecialistVisit[];

  /** Identyfikator dokumentu (domyślnie generowany). */
  readonly documentId?: string;
  /** Identyfikator zbioru wersji (domyślnie = `documentId`). */
  readonly documentSetId?: string;
  /** Numer wersji dokumentu (domyślnie 1). */
  readonly versionNumber?: number;
  /** Czas wystawienia; domyślnie `now ?? new Date()`. */
  readonly now?: Date;
  /** Nadpisanie czasu wystawienia (YYYYMMDDHHmmss). */
  readonly documentDate?: string;
}

/** Wynik buildera dokumentu IPOM. */
export interface IpomResult {
  readonly xml: string;
  readonly documentId: string;
  readonly documentDate: string;
}

// --- Harmonogram (HIPOM) ----------------------------------------------------

/**
 * Status realizacji zlecenia (SRZ, StatusRealizacji):
 * `NZPL` - Nie zaplanowano, `ZPL` - Zaplanowano, `ZRL` - Zrealizowano, `ANL` - Anulowano.
 */
export type RealizationStatus = "NZPL" | "ZPL" | "ZRL" | "ANL";

/** Pojedynczy wpis realizacji zlecenia w harmonogramie (SRZ + data zdarzenia). */
export interface ScheduleRealization {
  readonly status: RealizationStatus;
  /** Data zdarzenia realizacji (effectiveTime, YYYYMMDD). Pomijana dla `NZPL`. */
  readonly date?: string;
}

/** Sekcja edukacyjna harmonogramu - liczby porad + realizacje (SRZ). */
export interface ScheduleEducation extends IpomEducation {
  /** Realizacje porad dietetycznych (LPDIET). */
  readonly dietaryRealizations?: readonly ScheduleRealization[];
  /** Realizacje porad lekarskich/pielęgniarskich (LPPIEL). */
  readonly nursingRealizations?: readonly ScheduleRealization[];
}

/** Badanie w harmonogramie - zlecenie + realizacje (SRZ). */
export interface ScheduleDiagnosticTest extends IpomDiagnosticTest {
  readonly realizations?: readonly ScheduleRealization[];
}

/** Wizyta kontrolna w harmonogramie - termin + realizacje (SRZ). */
export interface ScheduleControlVisit extends IpomControlVisit {
  readonly realizations?: readonly ScheduleRealization[];
}

/** Wizyta specjalistyczna w harmonogramie - zlecenie + realizacje (SRZ). */
export interface ScheduleSpecialistVisit extends IpomSpecialistVisit {
  readonly realizations?: readonly ScheduleRealization[];
}

/** Referencja do dokumentu planu (IPOM), którego dotyczy harmonogram (sekcja „Załączniki"). */
export interface PlanReference {
  /** Identyfikator planu (`id` @extension; root `<localRoot>.26.1`). */
  readonly documentId: string;
  /** Identyfikator zbioru wersji planu (`setId` @extension; root `<localRoot>.26.2`). */
  readonly documentSetId: string;
  /** Numer wersji planu (domyślnie 1). */
  readonly versionNumber?: number;
}

/** Wejście buildera dokumentu harmonogramu IPOM (HIPOM). */
export interface IpomScheduleInput {
  readonly localRoot: string;
  readonly patient: CdaPatient;
  readonly author: CdaAuthor;
  readonly legalAuthenticator: CdaLegalAuthenticator;
  readonly providerOrganizationId: string;
  /** Dokument planu (IPOM), którego dotyczy harmonogram. */
  readonly plan: PlanReference;

  /** Sekcja „Status zdrowotny pacjenta" (wymagana). */
  readonly healthStatus: IpomHealthStatus;
  /** Sekcja „Rozpoznania" (wymagana, min 1). */
  readonly diagnoses: readonly IpomDiagnosis[];
  /** Sekcja „Porada edukacyjna..." z realizacją (wymagana). */
  readonly education: ScheduleEducation;
  /** Sekcja „Wizyty kontrolne" z realizacją (wymagana, min 1). */
  readonly controlVisits: readonly ScheduleControlVisit[];

  /** Sekcja „Farmakoterapia" (opcjonalna). */
  readonly medications?: readonly IpomMedication[];
  /** Sekcja „Zaplanowane badania diagnostyczne" z realizacją (opcjonalna). */
  readonly diagnosticTests?: readonly ScheduleDiagnosticTest[];
  /** Sekcja „Wizyty specjalistyczne" z realizacją (opcjonalna). */
  readonly specialistVisits?: readonly ScheduleSpecialistVisit[];

  readonly documentId?: string;
  readonly documentSetId?: string;
  readonly versionNumber?: number;
  readonly now?: Date;
  readonly documentDate?: string;
}
