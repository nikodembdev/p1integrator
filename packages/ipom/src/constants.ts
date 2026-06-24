/**
 * Stałe specyficzne dla IPOM (Indywidualny Plan Opieki Medycznej, plCdaIndividualMedicalCarePlan,
 * CDA PL IG 1.3.2.1). Szablony nagłówka różnią się od generycznego `@p1/cda`
 * (m.in. recordTarget `.2.3` z `providerOrganization`, autor `.2.4`,
 * `representedOrganization` `.2.17`, brak document-level `participant`, wrapper
 * `structuredBody` `.2.107`), dlatego IPOM ma dedykowany builder. OID-y i kody
 * odwzorowane z oficjalnego wzorca P1 `plan_opieki_medycznej-1.3.2.1.xml`
 * (zgodnego ze Schematronem `plcda-plCdaIndividualMedicalCarePlan` 2022-09-08).
 */

/** Szablon dokumentu planu opieki medycznej i jego wersja IG. */
export const IPOM_DOC_TEMPLATE = "2.16.840.1.113883.3.4424.13.10.1.41";
export const IPOM_IG_VERSION = "1.3.2.1";

/** Segment lokalnego root-a dla `id`/`setId` planu (`<localRoot>.26.1` / `.26.2`). */
export const IPOM_ID_SEGMENT = "26.1";
export const IPOM_SETID_SEGMENT = "26.2";

/** Szablon dokumentu harmonogramu planu opieki medycznej i jego wersja IG. */
export const IPOM_SCHEDULE_DOC_TEMPLATE = "2.16.840.1.113883.3.4424.13.10.1.42";
export const IPOM_SCHEDULE_IG_VERSION = "1.3.2";

/** Segment lokalnego root-a dla `id`/`setId` harmonogramu (`<localRoot>.27.1` / `.27.2`). */
export const IPOM_SCHEDULE_ID_SEGMENT = "27.1";
export const IPOM_SCHEDULE_SETID_SEGMENT = "27.2";

/** Szablony sekcji harmonogramu (warianty z realizacją SRZ) + wrapper `structuredBody`. */
export const IPOM_SCHEDULE = {
  STRUCTURED_BODY: "2.16.840.1.113883.3.4424.13.10.2.108",
  EDUCATION: "2.16.840.1.113883.3.4424.13.10.3.182",
  DIAGNOSTIC_TESTS: "2.16.840.1.113883.3.4424.13.10.3.183",
  CONTROL_VISITS: "2.16.840.1.113883.3.4424.13.10.3.184",
  SPECIALIST_VISITS: "2.16.840.1.113883.3.4424.13.10.3.185",
  /** Sekcja „Załączniki" - referencja do dokumentu planu (IPOM). */
  ATTACHMENTS: "2.16.840.1.113883.3.4424.13.10.3.39",
  /** Organizer/reference/externalDocument sekcji „Załączniki". */
  ATTACHMENT_ORGANIZER: "2.16.840.1.113883.3.4424.13.10.4.31",
  ATTACHMENT_REFERENCE: "2.16.840.1.113883.3.4424.13.10.4.32",
  ATTACHMENT_EXTERNAL_DOC: "2.16.840.1.113883.3.4424.13.10.4.33",
} as const;

/** System kodowania statusu realizacji zlecenia (SRZ). */
export const REALIZATION_OID = "2.16.840.1.113883.3.4424.13.5.13.5";

/** Słownik statusu realizacji zlecenia (SRZ, StatusRealizacji). */
export const REALIZATION_VALUES = {
  NZPL: "Nie zaplanowano",
  ZPL: "Zaplanowano",
  ZRL: "Zrealizowano",
  ANL: "Anulowano",
} as const;

/** Szablony części nagłówka IPOM (różne od generycznych `CDA_TEMPLATE`). */
export const IPOM_TEMPLATE = {
  RECORD_TARGET: "2.16.840.1.113883.3.4424.13.10.2.3",
  PROVIDER_ORGANIZATION: "2.16.840.1.113883.3.4424.13.10.2.2",
  AUTHOR: "2.16.840.1.113883.3.4424.13.10.2.4",
  PERSON: "2.16.840.1.113883.3.4424.13.10.2.1",
  REPRESENTED_ORGANIZATION: "2.16.840.1.113883.3.4424.13.10.2.17",
  NFZ_CONTRACT: "2.16.840.1.113883.3.4424.13.10.2.44",
  CUSTODIAN: "2.16.840.1.113883.3.4424.13.10.2.20",
  LEGAL_AUTHENTICATOR: "2.16.840.1.113883.3.4424.13.10.2.6",
  /** Wrapper `component/structuredBody` (DOCBODY) - swoisty dla IPOM. */
  STRUCTURED_BODY: "2.16.840.1.113883.3.4424.13.10.2.107",
} as const;

/** Szablony sekcji klinicznych planu (`structuredBody/component/section`). */
export const IPOM_SECTION = {
  HEALTH_STATUS: "2.16.840.1.113883.3.4424.13.10.3.174",
  DIAGNOSES: "2.16.840.1.113883.3.4424.13.10.3.175",
  PHARMACOTHERAPY: "2.16.840.1.113883.3.4424.13.10.3.176",
  EDUCATION: "2.16.840.1.113883.3.4424.13.10.3.177",
  DIAGNOSTIC_TESTS: "2.16.840.1.113883.3.4424.13.10.3.178",
  CONTROL_VISITS: "2.16.840.1.113883.3.4424.13.10.3.180",
  SPECIALIST_VISITS: "2.16.840.1.113883.3.4424.13.10.3.179",
  ADDITIONAL_INFO: "2.16.840.1.113883.3.4424.13.10.3.2",
} as const;

/** System kodowania atrybutów IPOM (DWOSP/SOPS/ZBLAB/ZOWB/ZOWK/...). */
export const ATRYBUTY_IPOM_OID = "2.16.840.1.113883.3.4424.13.5.6";
/** System kodowania stratyfikacji stanu pacjenta (S/P/Z). */
export const STRATIFICATION_OID = "2.16.840.1.113883.3.4424.13.5.13.1";
/** System kodowania specjalisty IPOM (KARDIO/ENDOKR/DIAEND/PULALE). */
export const SPECJALISTA_IPOM_OID = "2.16.840.1.113883.3.4424.13.5.13.2";
/** System kodowania rodzaju terminu zleconego badania (ZOWB). */
export const TEST_SCHEDULE_OID = "2.16.840.1.113883.3.4424.13.5.13.3";
/** System kodowania rodzaju terminu wizyty kontrolnej (ZOWK). */
export const CONTROL_VISIT_OID = "2.16.840.1.113883.3.4424.13.5.13.4";
/** System kodowania GS1 (GTIN/EAN produktu leczniczego). */
export const GS1_OID = "1.3.160";
/** System kodowania aktów farmaceutycznych (`code DRUG`). */
export const HL7_ACT_OID = "2.16.840.1.113883.5.4";

/** Kody atrybutów IPOM (codeSystem `ATRYBUTY_IPOM_OID`) z `displayName` wg wzorca. */
export const IPOM_CODE = {
  /** Data wykonania oceny stanu pacjenta. */
  ASSESSMENT_DATE: { code: "DWOSP", display: "Data wykonania oceny stanu pacjenta" },
  /** Stan ogólny pacjenta - Stratyfikacja (literówka `pacjetna` jest we wzorcu P1). */
  STRATIFICATION: { code: "SOPS", display: "Stan ogólny pacjetna Stratyfikacja" },
  /** Liczba porad dietetycznych. */
  DIETARY_COUNT: { code: "LPDIET", display: "Liczba porad dietetycznych" },
  /** Liczba porad pielęgniarskich. */
  NURSING_COUNT: { code: "LPPIEL", display: "Liczba porad pielęgniarskich" },
  /** Inne zalecenia. */
  OTHER_RECOMMENDATION: { code: "INNZAL", display: "Inne zalecenia" },
  /** Zalecenia edukacyjne i postępowanie niefarmakologiczne (translation w `code` sekcji 177). */
  EDUCATION: { code: "ZEIPN", display: "Zalecenia edukacyjne i postępowanie niefarmakologiczne" },
  /** Zlecenie badania laboratoryjnego. */
  TEST_LAB: { code: "ZBLAB", display: "Zlecenie badania laboratoryjnego" },
  /** Zlecenie badania obrazowego. */
  TEST_IMAGING: { code: "ZBOBR", display: "Zlecenie badania obrazowego" },
  /** Zlecenie badania innego. */
  TEST_OTHER: { code: "ZBINN", display: "Zlecenie badania innego" },
  /** Zalecany okres wykonywania badania. */
  TEST_SCHEDULE: { code: "ZOWB", display: "Zalecany okres wykonywania badania" },
  /** Zalecany okres wizyty kontrolnej. */
  CONTROL_VISIT: { code: "ZOWK", display: "Zalecany okres wizyty kontrolnej" },
  /** Opis wymaganych zadań przed wizytą. */
  REQUIRED_TASKS: { code: "OWZPW", display: "Opis wymaganych zadań przed wizytą" },
  /** Wizyty kontrolne (translation w `code` sekcji 180). */
  CONTROL_VISITS_SECTION: { code: "WIZKON", display: "Wizyty kontrolne" },
  /** Wymagane wizyty specjalistyczne (translation w `code` sekcji 179). */
  SPECIALIST_VISITS_SECTION: { code: "WIZSPEC", display: "Wymagane wizyty specjalistyczne" },
  /** Zlecenie konsultacji (wpis wizyty/konsultacji specjalistycznej). */
  CONSULTATION: { code: "ZKON", display: "Zlecenie konsultacji" },
  /** Status realizacji zlecenia (harmonogram). */
  REALIZATION: { code: "SRZ", display: "Status Realizacji Zlecenia" },
} as const;

/** Kody LOINC używane w sekcjach/wpisach IPOM. */
export const LOINC_CODE = {
  /** Kod obserwacji rozpoznania (`entry/observation/code`). */
  DIAGNOSIS: { code: "29308-4", display: "Diagnosis" },
  /** Dawkowanie leku. */
  MEDICATION_DOSE: { code: "18817-7", display: "Medication dose" },
  /** Okres przyjmowania leku. */
  DATE_LAST_DOSE: { code: "29742-4", display: "Date last dose" },
} as const;

/** Słownik stratyfikacji stanu ogólnego pacjenta (SOPS). */
export const STRATIFICATION_VALUES = {
  S: "Stabilny",
  P: "Pośredni",
  Z: "Zagrożony niestabilnością",
} as const;

/** Słownik specjalistów IPOM (SpecjalistaIPOM). */
export const SPECIALIST_VALUES = {
  KARDIO: "Kardiolog",
  ENDOKR: "Endokrynolog",
  DIAEND: "Diabetolog / Endokrynolog",
  PULALE: "Pulmonolog / Alergolog",
} as const;

/** Słownik rodzajów terminu zleconego badania (ZOWB, RodzajTerminuZleconegoBadania). */
export const TEST_SCHEDULE_VALUES = {
  INTERWAL: "Interwał",
  NAJSZYB: "Najszybciej jak to możliwe",
  CZASPOWIZ: "Określony czas po wizycie",
  DOCZASU: "Do określonego czasu",
  CZASPRZEDWIZ: "Na określony czas przed wizytą",
  PRZEDNASTWIZ: "Przed następną wizytą",
} as const;

/** Słownik rodzajów terminu wizyty kontrolnej (ZOWK, RodzajTerminuWizytyKontrolnej). */
export const CONTROL_VISIT_VALUES = {
  POOKRCZASIE: "Po określonym czasie",
  INTERWAL: "Interwał",
  POWYKBADAN: "Po wykonaniu badań",
  POWYKZLECZADAN: "Po wykonaniu zleconych zadań",
} as const;
