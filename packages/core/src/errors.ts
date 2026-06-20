import type { OperationOutcome } from "./outcome.js";

/**
 * Taksonomia błędów P1. Dwa tory:
 *  - techniczny (BladMT, wyjatki.xsd) - stały enum `ErrorCodeMajor`/`ErrorCodeMinor`,
 *    mapowany na konkretne podklasy przez `technicalErrorToP1Error`,
 *  - biznesowy (WynikMT) - `P1BusinessError` opakowujący `OperationOutcome`.
 *
 * Konwencja: nazwy typów po angielsku, ale *klucze* enumów technicznych zostają
 * po polsku - to dosłowne lustro `wyjatki.xsd` (łatwy grep wobec specyfikacji P1).
 */

export type P1ErrorKind =
  | "validation"
  | "authentication"
  | "authorization"
  | "business"
  | "server"
  | "transport";

// ─────────────────────────────────────────────────────────────
// Kody błędów technicznych (BladMT) - klucze wprost z wyjatki.xsd
// ─────────────────────────────────────────────────────────────

export const ERROR_CODE_MAJOR = {
  bladPodpisuKomunikatu: "urn:csioz:p1:kodBleduMajor:bladPodpisuKomunikatu",
  kontoZablokowane: "urn:csioz:p1:kodBleduMajor:kontoZablokowane",
  niepoprawnyKomunikat: "urn:csioz:p1:kodBleduMajor:niepoprawnyKomunikat",
  bladUwierzytelnienia: "urn:csioz:p1:kodBleduMajor:bladUwierzytelnienia",
  bladAutoryzacji: "urn:csioz:p1:kodBleduMajor:bladAutoryzacji",
  bladWewnetrzny: "urn:csioz:p1:kodBleduMajor:bladWewnetrzny",
  bladPodpisuKomunikatuWSS: "urn:csioz:p1:kodBleduMajor:bladPodpisuKomunikatuWSS",
  bladUwierzytelnieniaWSS: "urn:csioz:p1:kodBleduMajor:bladUwierzytelnieniaWSS",
  przekroczonyCzas: "urn:csioz:p1:kodBleduMajor:przekroczonyCzas",
} as const;
export type ErrorCodeMajor = keyof typeof ERROR_CODE_MAJOR;

export const ERROR_CODE_MINOR = {
  certyfikatNiewazny: "urn:csioz:p1:kodBleduMinor:certyfikatNiewazny",
  brakCertyfikatu: "urn:csioz:p1:kodBleduMinor:brakCertyfikatu",
  bladKontekstu: "urn:csioz:p1:kodBleduMinor:bladKontekstu",
  brakUprawnienPodmiotu: "urn:csioz:p1:kodBleduMinor:brakUprawnienPodmiotu",
  brakUprawnienPracownikaMedycznego: "urn:csioz:p1:kodBleduMinor:brakUprawnienPracownikaMedycznego",
  bladZapisu: "urn:csioz:p1:kodBleduMinor:bladZapisu",
} as const;
export type ErrorCodeMinor = keyof typeof ERROR_CODE_MINOR;

export interface TechnicalErrorCode {
  readonly major: ErrorCodeMajor;
  readonly minor?: ErrorCodeMinor;
  /** Tekstowy opis błędu od P1 (może być po polsku). */
  readonly description?: string;
}

const MAJOR_BY_URN: Readonly<Record<string, ErrorCodeMajor>> = Object.fromEntries(
  Object.entries(ERROR_CODE_MAJOR).map(([key, urn]) => [urn, key as ErrorCodeMajor]),
);
const MINOR_BY_URN: Readonly<Record<string, ErrorCodeMinor>> = Object.fromEntries(
  Object.entries(ERROR_CODE_MINOR).map(([key, urn]) => [urn, key as ErrorCodeMinor]),
);

export const parseErrorCodeMajor = (urn: string): ErrorCodeMajor | undefined => MAJOR_BY_URN[urn];
export const parseErrorCodeMinor = (urn: string): ErrorCodeMinor | undefined => MINOR_BY_URN[urn];

// ─────────────────────────────────────────────────────────────
// Hierarchia błędów
// ─────────────────────────────────────────────────────────────

export interface P1ErrorOptions extends ErrorOptions {
  readonly technical?: TechnicalErrorCode;
}

export abstract class P1Error extends Error {
  abstract readonly kind: P1ErrorKind;
  /** Czy ponowienie żądania ma sens (błąd przejściowy). */
  abstract readonly retryable: boolean;
  /** Surowy kod techniczny P1, jeśli błąd z niego wynika. */
  readonly technical?: TechnicalErrorCode;

  constructor(message: string, options?: P1ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    if (options?.technical) this.technical = options.technical;
  }
}

export class P1ValidationError extends P1Error {
  readonly kind = "validation";
  readonly retryable = false;
}

export class P1AuthenticationError extends P1Error {
  readonly kind = "authentication";
  readonly retryable = false;
}

export class P1AuthorizationError extends P1Error {
  readonly kind = "authorization";
  readonly retryable = false;
}

export class P1ServerError extends P1Error {
  readonly kind = "server";
  readonly retryable = true;
}

export class P1TransportError extends P1Error {
  readonly kind = "transport";
  readonly retryable = true;
}

export class P1BusinessError extends P1Error {
  readonly kind = "business";
  readonly retryable = false;
  readonly outcome?: OperationOutcome;

  constructor(message: string, options?: P1ErrorOptions & { readonly outcome?: OperationOutcome }) {
    super(message, options);
    if (options?.outcome) this.outcome = options.outcome;
  }
}

export function businessErrorFromOutcome(outcome: OperationOutcome): P1BusinessError {
  return new P1BusinessError(outcome.message ?? outcome.major, { outcome });
}

/**
 * Mapuje techniczny BladMT na konkretną podklasę `P1Error`.
 * Najpierw rozpatruje `minor` (bardziej szczegółowy), potem `major`.
 */
export function technicalErrorToP1Error(code: TechnicalErrorCode): P1Error {
  const message = code.description ?? code.major;
  const options: P1ErrorOptions = { technical: code };

  switch (code.minor) {
    case "brakUprawnienPodmiotu":
    case "brakUprawnienPracownikaMedycznego":
      return new P1AuthorizationError(message, options);
    case "certyfikatNiewazny":
    case "brakCertyfikatu":
      return new P1AuthenticationError(message, options);
    case "bladKontekstu":
      return new P1ValidationError(message, options);
    case "bladZapisu":
      return new P1ServerError(message, options);
    case undefined:
      break;
  }

  switch (code.major) {
    case "bladUwierzytelnienia":
    case "bladUwierzytelnieniaWSS":
    case "bladPodpisuKomunikatu":
    case "bladPodpisuKomunikatuWSS":
    case "kontoZablokowane":
      return new P1AuthenticationError(message, options);
    case "bladAutoryzacji":
      return new P1AuthorizationError(message, options);
    case "niepoprawnyKomunikat":
      return new P1ValidationError(message, options);
    case "przekroczonyCzas":
      return new P1TransportError(message, options);
    case "bladWewnetrzny":
      return new P1ServerError(message, options);
  }
}
