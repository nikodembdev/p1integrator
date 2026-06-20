import { P1ValidationError } from "./errors.js";
import type { Result } from "./result.js";
import { err, ok } from "./result.js";

/** PESEL — 11 cyfr z poprawną sumą kontrolną. */
export type Pesel = string & { readonly __brand: "Pesel" };

const PESEL_WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3] as const;

export function pesel(value: string): Result<Pesel, P1ValidationError> {
  if (!/^\d{11}$/.test(value)) {
    return err(new P1ValidationError("PESEL must be 11 digits"));
  }
  const digits = [...value].map(Number);
  let sum = 0;
  for (let i = 0; i < PESEL_WEIGHTS.length; i += 1) {
    sum += PESEL_WEIGHTS[i]! * digits[i]!;
  }
  const control = (10 - (sum % 10)) % 10;
  if (control !== digits[10]) {
    return err(new P1ValidationError("Invalid PESEL checksum"));
  }
  return ok(value as Pesel);
}

/** Płeć zakodowana w numerze PESEL (10. cyfra: parzysta → kobieta). */
export const peselSex = (value: Pesel): "M" | "F" => (Number(value[9]) % 2 === 0 ? "F" : "M");

/**
 * NPWZ — numer prawa wykonywania zawodu (lekarz), 7 cyfr.
 * Pierwsza cyfra to cyfra kontrolna: (Σ pozycja_i · cyfra_i) mod 11 dla cyfr 2..7.
 * TODO: zweryfikować algorytm wobec dokumentacji integracyjnej P1.
 */
export type Npwz = string & { readonly __brand: "Npwz" };

export function npwz(value: string): Result<Npwz, P1ValidationError> {
  if (!/^\d{7}$/.test(value)) {
    return err(new P1ValidationError("NPWZ must be 7 digits"));
  }
  const d = [...value].map(Number);
  const checksum = (1 * d[1]! + 2 * d[2]! + 3 * d[3]! + 4 * d[4]! + 5 * d[5]! + 6 * d[6]!) % 11;
  if (checksum !== d[0]) {
    return err(new P1ValidationError("Invalid NPWZ checksum"));
  }
  return ok(value as Npwz);
}
