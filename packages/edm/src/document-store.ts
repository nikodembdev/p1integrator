import { createHash } from "node:crypto";

/**
 * Port przechowywania treści dokumentów EDM. Repozytorium robi każdy u siebie
 * (dysk, S3, baza...) - biblioteka tylko go używa przez ten interfejs. Wpięty
 * w handlery ITI-41/ITI-43 daje gotowe repozytorium na poziomie protokołu.
 */
export interface DocumentStore {
  /** Zapisuje treść i zwraca metadane indeksowe (uniqueId, hash, rozmiar). */
  put(input: PutDocumentInput): Promise<StoredDocument>;
  /** Pobiera treść po identyfikatorach repozytorium i dokumentu (lub `undefined`). */
  get(ref: DocumentRef): Promise<DocumentContent | undefined>;
}

export interface PutDocumentInput {
  /** uniqueId dokumentu (OID); gdy pominięty, repozytorium nadaje własny. */
  readonly uniqueId?: string;
  /** Typ MIME treści (np. `text/xml` dla CDA, `application/pdf`). */
  readonly mimeType: string;
  /** Treść dokumentu (oktety). */
  readonly content: Buffer;
}

export interface DocumentRef {
  /** Identyfikator repozytorium (OID) - slot `repositoryUniqueId`. */
  readonly repositoryUniqueId: string;
  /** uniqueId dokumentu. */
  readonly documentUniqueId: string;
}

export interface DocumentContent {
  readonly content: Buffer;
  readonly mimeType: string;
}

/** Metadane treści potrzebne do indeksu DocumentEntry. */
export interface StoredDocument {
  readonly uniqueId: string;
  readonly mimeType: string;
  /** SHA-1 treści (hex, małe litery) - slot `hash` w DocumentEntry. */
  readonly hash: string;
  /** Rozmiar w bajtach - slot `size`. */
  readonly size: number;
}

/** SHA-1 treści jako hex (slot `hash` indeksu XDS). */
export function sha1Hex(content: Buffer): string {
  return createHash("sha1").update(content).digest("hex");
}

/**
 * Liczy metadane indeksowe treści (hash + rozmiar) dla DocumentEntry. `uniqueId`
 * podawany przez repozytorium (albo wcześniej wygenerowany).
 */
export function documentMetadata(
  content: Buffer,
  mimeType: string,
  uniqueId: string,
): StoredDocument {
  return { uniqueId, mimeType, hash: sha1Hex(content), size: content.byteLength };
}
