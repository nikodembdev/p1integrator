import type { BusinessRole } from "../context.js";
import type { Npwz } from "../identifiers.js";

/**
 * Pracownik medyczny (wystawiający).
 */
export interface Practitioner {
  readonly npwz: Npwz;
  readonly role: BusinessRole;
  readonly firstName?: string;
  readonly lastName?: string;
}
