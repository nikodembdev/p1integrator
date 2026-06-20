/**
 * @p1/cda - generyczny toolkit dokumentów CDA PL IG 1.3.2 (P1): prymitywy
 * (DocumentId, daty), bazowe OID-y i szablony nagłówka oraz builder
 * `buildClinicalDocument`. Dokumenty konkretnych typów (skierowanie, recepta)
 * budują moduły domenowe (@p1/referral, @p1/prescription) na bazie tego toolkitu.
 */

export * from "./oids.js";
export * from "./document-id.js";
export * from "./datetime.js";
export * from "./types.js";
export * from "./clinical-document.js";
