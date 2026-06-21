/**
 * @p1/medical-events - zdarzenia medyczne (ZM). Integracja REST/FHIR R4 + OAuth2.
 *
 * ZAKRES: obecnie wspierany jest tylko jeden typ zdarzenia - PORADA (typ 4).
 * Pozostałe typy (hospitalizacja, wyjazd ratunkowy, bilans) i zasoby pomocnicze
 * (Observation, Coverage, Claim) nie są jeszcze zaimplementowane. Szczegóły:
 * docs/zdarzenia.md.
 */

export * from "./oauth.js";
export * from "./fhir-client.js";
export * from "./patient.js";
export * from "./encounter.js";
export * from "./condition.js";
export * from "./provenance.js";
