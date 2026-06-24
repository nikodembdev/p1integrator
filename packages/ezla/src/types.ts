import type { Clock, HttpClient } from "@p1/core";
import type { AUTH_METHOD, DOCUMENT_KIND, ISSUE_MODE } from "./constants.js";

/** Metoda uwierzytelnienia (`certyfikat` / `ePuap`). */
export type AuthMethod = (typeof AUTH_METHOD)[keyof typeof AUTH_METHOD];
/** Tryb wystawiania (`Biezacy` / `Alternatywny`). */
export type IssueMode = (typeof ISSUE_MODE)[keyof typeof ISSUE_MODE];
/** Rodzaj dokumentu (`ZLA`/`KOPIA_ZLA`/`AZLA`/`UZLA`). */
export type DocumentKind = (typeof DOCUMENT_KIND)[keyof typeof DOCUMENT_KIND];

/** Wynik operacji ZUS (`docTypeRef_Rezultat`): kod + opis błędu (puste = sukces). */
export interface ZusResult {
  /** Kod błędu (`KodBledu`); brak/pusty zwykle oznacza powodzenie. */
  readonly errorCode?: string;
  /** Opis błędu (`OpisBledu`). */
  readonly errorMessage?: string;
}

/** Pojedynczy błąd walidacji dokumentu (`docTypeRef_BladWalidacji`). */
export interface ValidationError {
  readonly code?: string;
  readonly message?: string;
  /** Wskazanie miejsca w dokumencie (jeśli zwrócone). */
  readonly location?: string;
}

/** Wynik walidacji dokumentu (`docTypeRef_RezultatWalidacji`). */
export interface ValidationResult {
  /** Zbiorczy wynik (`RezultatWalidacjiEnumeracja`), np. „Pozytywny"/„Negatywny". */
  readonly result?: string;
  readonly errors: readonly ValidationError[];
}

/** Seria i numer druku ZLA (`docTypeRef_SeriaNumerZla`). */
export interface SeriaNumerZla {
  readonly seria: string;
  readonly numer: string;
}

/** Zależności transportu e-ZLA (kanał gabinetowy ZUS). */
export interface EzlaTransport {
  /** Klient HTTP (HTTPS; symulator akceptuje cert ZUS). */
  readonly httpClient: HttpClient;
  /** Endpoint usługi (np. {@link SIMULATOR_ENDPOINT}). */
  readonly endpoint: string;
  /** HTTP Basic Auth (symulator: `ezla_ag`/`ezla_ag`). */
  readonly credentials: { readonly login: string; readonly password: string };
  /** Zegar - do deterministycznych dat w testach. */
  readonly clock?: Clock;
}

/** Sesja po zalogowaniu podpisem (`IdSesji`). */
export interface EzlaSession {
  readonly idSesji: string;
}

/**
 * Port podpisu XML wymagany przez e-ZLA (do dostarczenia przez konsumenta, np.
 * adapter na bazie `xml-crypto`). ZUS używa XML-DSig (enveloped), innego niż
 * XAdES/WS-Security P1 - dlatego osobny port.
 */
export interface EzlaSigner {
  /**
   * Podpisuje oświadczenie logowania (`zalogujPodpisem/PodpisaneOswiadczenie`)
   * certyfikatem kwalifikowanym/ZUS/e-dowodem; zwraca podpisane XML (lub base64).
   */
  signLoginStatement(statement: string): Promise<string>;
  /** Podpisuje dokument KEDU ZLA (enveloped XML-DSig); zwraca podpisany XML. */
  signDocument(keduXml: string): Promise<string>;
}

// --- Dokument ZLA (KED ZLA, sekcje I-VIII) ----------------------------------

/** Okres niezdolności do pracy (sekcja IV). */
export interface IncapacityPeriod {
  /** Data od (YYYY-MM-DD). */
  readonly from: string;
  /** Data do (YYYY-MM-DD). */
  readonly to: string;
}

/** Dane płatnika składek (sekcja VI). */
export interface PayerData {
  readonly name: string;
  readonly postalCode: string;
  readonly city: string;
  readonly street: string;
  readonly houseNumber: string;
}

/**
 * Wejście buildera dokumentu ZLA (zaświadczenie lekarskie). Pola odwzorowują
 * sekcje rzymskie KED ZLA (I-VIII) z `ked_zla_1.1.xsd`. SKELETON - mapowanie pełne
 * do uzupełnienia wg XSD (m.in. kody ICD-10, kod ubezpieczenia, flagi sekcji VIII).
 */
export interface ZlaInput {
  /** Identyfikator dokumentu w KEDU (`ZUSZLA/@id_dokumentu`). */
  readonly documentId: string;
  /** Seria i numer druku (sekcja I) - z `nadajSeriaNumerZla`/`pobierzSeriaNumerZla`. */
  readonly seriaNumer: SeriaNumerZla;
  /** Typ serii (sekcja I.p1.p1), np. „ZW". */
  readonly seriaType?: string;
  /** ORYGINAŁ / KOPIA (sekcja I.p2). */
  readonly copy?: "ORYGINAL" | "KOPIA";

  /** Ubezpieczony (sekcja II): PESEL, imię, nazwisko. */
  readonly insured: {
    readonly pesel: string;
    readonly firstName: string;
    readonly lastName: string;
  };
  /** Adres ubezpieczonego (sekcja III). */
  readonly insuredAddress: {
    readonly postalCode: string;
    readonly city: string;
    readonly street: string;
    readonly houseNumber: string;
  };
  /** Okres niezdolności (sekcja IV). */
  readonly incapacity: IncapacityPeriod;
  /** Płatnik składek (sekcja VI). */
  readonly payer: PayerData;
  /** Lekarz wystawiający (sekcja VII): NPWZ, imię, nazwisko. */
  readonly doctor: { readonly npwz: string; readonly firstName: string; readonly lastName: string };
  /** Data wystawienia (sekcja VIII, YYYY-MM-DD). */
  readonly issueDate: string;
  /** Program wystawiający (nagłówek KEDU). */
  readonly program?: {
    readonly producent: string;
    readonly symbol: string;
    readonly wersja: string;
  };
}

/** Wynik buildera dokumentu ZLA (niepodpisany KEDU). */
export interface ZlaDocumentResult {
  /** XML dokumentu KEDU (do podpisania przez {@link EzlaSigner}). */
  readonly keduXml: string;
  readonly documentId: string;
}
