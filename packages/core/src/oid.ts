import { P1ValidationError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

/**
 * Identyfikator OID P1 (IdentyfikatorOIDMT, wspolne.xsd).
 * `root` = węzeł/typ identyfikatora, `extension` = konkretna wartość.
 * Np. PESEL: root = 2.16.840.1.113883.3.4424.1.1.616, extension = numer PESEL.
 */
export interface Oid {
  readonly root: string;
  readonly extension: string;
}

const OID_ROOT_PATTERN = /^\d+(\.\d+)+$/;

export function oid(root: string, extension: string): Result<Oid, P1ValidationError> {
  if (!OID_ROOT_PATTERN.test(root)) {
    return err(new P1ValidationError(`Invalid OID root: "${root}"`));
  }
  if (extension.trim().length === 0) {
    return err(new P1ValidationError("OID extension must not be empty"));
  }
  return ok({ root, extension });
}

export const oidEquals = (a: Oid, b: Oid): boolean =>
  a.root === b.root && a.extension === b.extension;

/** Dobrze znane węzły OID (root) używane w P1. */
export const OID_ROOT = {
  /** PESEL usługobiorcy */
  PESEL: "2.16.840.1.113883.3.4424.1.1.616",
  /** NPWZ — lekarz / lekarz dentysta */
  NPWZ_DOCTOR: "2.16.840.1.113883.3.4424.1.6.2",
  /** PWZ — pielęgniarka / położna */
  PWZ_NURSE_MIDWIFE: "2.16.840.1.113883.3.4424.1.6.3",
  /** PWZ — farmaceuta */
  PWZ_PHARMACIST: "2.16.840.1.113883.3.4424.1.6.1",
  /** PWZ — diagnosta laboratoryjny */
  PWZ_LAB_DIAGNOSTICIAN: "2.16.840.1.113883.3.4424.1.6.4",
  /** PWZ — fizjoterapeuta */
  PWZ_PHYSIOTHERAPIST: "2.16.840.1.113883.3.4424.1.6.5",
} as const;
