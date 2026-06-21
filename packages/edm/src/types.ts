/**
 * Wspólne typy EDM (IHE XDS.b). Wartości na drucie (kody, schematy) zostają po polsku/OID;
 * nasza abstrakcja po angielsku.
 */

/** Identyfikator OID (węzeł + wartość). */
export interface OidIdentifier {
  readonly root: string;
  readonly extension: string;
}

/**
 * Tryb dostępu do danych EDM (przekazywany w tokenie/kontekście):
 * NORMAL - zwykły, BTG - ratowanie życia (break the glass), CONTT - kontynuacja leczenia.
 */
export type AccessMode = "NORMAL" | "BTG" | "CONTT";

/** Status obiektu rejestru (ebRS availabilityStatus). */
export type AvailabilityStatus = "Approved" | "Deprecated" | "Submitted";

/** Typ asocjacji między indeksami dokumentów. */
export type AssociationType =
  | "RPLC" // zastąpienie (oryginał -> Deprecated)
  | "XFRM" // transformacja (np. tłumaczenie)
  | "APND" // załącznik
  | "HasMember"; // SubmissionSet -> DocumentEntry
