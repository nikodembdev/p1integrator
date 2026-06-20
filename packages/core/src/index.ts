/**
 * @p1/core - rdzeń SDK P1: typy domenowe, Result, taksonomia błędów,
 * Kontekst, identyfikatory, rejestr środowisk oraz porty (HttpClient,
 * DocumentSigner, EnvelopeSigner, Clock).
 */

export * from "./result.js";
export * from "./outcome.js";
export * from "./errors.js";
export * from "./oid.js";
export * from "./identifiers.js";
export * from "./context.js";
export * from "./environment.js";

export * from "./domain/patient.js";
export * from "./domain/practitioner.js";

export * from "./ports/http-client.js";
export * from "./ports/document-signer.js";
export * from "./ports/envelope-signer.js";
export * from "./ports/clock.js";
