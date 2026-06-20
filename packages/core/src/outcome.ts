/**
 * WynikMT - wynik wykonania operacji *biznesowej* P1.
 * (namespace: http://csioz.gov.pl/p1/wspolne/mt/v20180509)
 *
 * Odróżnij od `TechnicalErrorCode` (BladMT, wyjatki.xsd): tam jest stały enum
 * błędów technicznych; tutaj `major`/`minor` to otwarta lista kodów (anyURI)
 * udokumentowana w dokumentacji integracyjnej / „Kody wyników operacji".
 */
export interface OperationOutcome {
  /** Kod główny wyniku (anyURI). */
  readonly major: string;
  /** Uzupełniający kod wyniku (anyURI). */
  readonly minor?: string;
  /** Treść komunikatu związanego z wynikiem operacji (tekst od P1). */
  readonly message?: string;
}
