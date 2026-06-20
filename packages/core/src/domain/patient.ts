import type { Pesel } from "../identifiers.js";

/**
 * Usługobiorca (pacjent).
 */
export interface Patient {
  readonly pesel: Pesel;
  readonly firstName?: string;
  readonly lastName?: string;
}
