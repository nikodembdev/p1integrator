/** Stałe Patient Summary (Karta Pacjenta). */

/** Zakres (scope) tokenu OAuth2 dla usługi Patient Summary. */
export const PATIENT_SUMMARY_SCOPE = "https://ezdrowie.gov.pl/patient-summary";

/** Wartość `aud` w blobie `KontekstUzytkownika` (wg wzorca P1). */
export const PATIENT_SUMMARY_CONTEXT_AUDIENCE = "https://ezdrowie.gov.pl/fhir";
/** Wartość `iss` w blobie `KontekstUzytkownika`. */
export const PATIENT_SUMMARY_CONTEXT_ISSUER = "https://ezdrowie.gov.pl";

/** Węzeł OID identyfikatora pacjenta (PESEL). */
export const PESEL_OID = "2.16.840.1.113883.3.4424.1.1.616";

/** Kod LOINC dokumentu Patient Summary (CDA). */
export const PATIENT_SUMMARY_DOCUMENT_CODE = "60591-5";
