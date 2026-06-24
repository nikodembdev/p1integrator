import type { Clock, HttpClient } from "@p1/core";

/** Format pobieranego dokumentu Patient Summary. */
export type PatientSummaryFormat = "PDF" | "HL7_CDA";

/**
 * Tryb dostępu do danych (`Kontekst-trybDostepuDoDanych`):
 * `BTG` - ratowanie życia (Break The Glass), `CONTT` - kontynuacja leczenia.
 */
export type AccessMode = "BTG" | "CONTT";

/** Identyfikator OID w formacie `root:extension`. */
export interface OidRef {
  readonly root: string;
  readonly extension: string;
}

/** Kontekst dostępu do Patient Summary (przekazywany w nagłówkach żądania). */
export interface PatientSummaryContext {
  /** Identyfikator pacjenta (`Identyfikator-Pacjenta`), zwykle PESEL. */
  readonly patient: OidRef;
  /** Identyfikator podmiotu (`Kontekst-idPodmiotu`, root `.2.3.1`). */
  readonly subject: OidRef;
  /** Miejsce udzielania świadczeń (`Kontekst-idMiejscaUdzielaniaSwiadczen`, root `.2.3.3`). */
  readonly workplace: OidRef;
  /** Identyfikator użytkownika (`Kontekst-idUzytkownika`, np. NPWZ root `.1.6.2`). */
  readonly user: OidRef;
  /** Rola użytkownika (`Kontekst-rolaUzytkownika`), np. „LEK". */
  readonly userRole: string;
  /** Tryb dostępu do danych (`Kontekst-trybDostepuDoDanych`). */
  readonly accessMode: AccessMode;
}

/** Zależności transportu Patient Summary. */
export interface PatientSummaryTransport {
  /** Klient HTTP z mTLS. */
  readonly httpClient: HttpClient;
  /** Bazowy URL usługi (np. `https://tsus.ezdrowie.gov.pl`). */
  readonly baseUrl: string;
  /** Token dostępu OAuth2 (Bearer) - zdobyty z usługi `/token`. */
  readonly accessToken: string;
  /** Zegar - do deterministycznego `exp`/czasu w `KontekstUzytkownika` (testy). */
  readonly clock?: Clock;
  /** Stały `uuidZdarzeniaInicjujacego` - wstrzykiwalny dla testów (domyślnie UUID). */
  readonly correlationId?: string;
}

/** Pobrany dokument Patient Summary. */
export interface PatientSummaryDocument {
  readonly format: PatientSummaryFormat;
  /** Unikalny identyfikator dokumentu (`idDokumentu`). */
  readonly documentId?: string;
  /** Zawartość dokumentu po zdekodowaniu z base64 (bajty PDF albo CDA). */
  readonly content: Buffer;
  /** Treść CDA jako tekst (tylko dla formatu `HL7_CDA`). */
  readonly cdaXml?: string;
  /** Data i godzina wygenerowania dokumentu (ISO 8601 UTC). */
  readonly generatedAt?: string;
}
