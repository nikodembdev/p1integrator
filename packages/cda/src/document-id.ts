import { randomInt } from "node:crypto";

const DOCUMENT_ID_PATTERN = /^[1-9]\d{21}$/;

/**
 * Generuje 22-cyfrowy identyfikator dokumentu P1 (pierwsza cyfra 1-9).
 * Losowość z `node:crypto` (bez biasu).
 */
export function generateDocumentId(): string {
  let id = String(randomInt(1, 10));
  for (let i = 0; i < 21; i += 1) {
    id += String(randomInt(0, 10));
  }
  return id;
}

export const isValidDocumentId = (value: string): boolean => DOCUMENT_ID_PATTERN.test(value);
