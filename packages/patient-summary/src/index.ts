/**
 * @p1/patient-summary - Patient Summary (Karta Pacjenta) nad REST API P1:
 * pobranie podsumowania pacjenta (PDF lub HL7 CDA) na podstawie identyfikatora
 * pacjenta i kontekstu dostępu. Autoryzacja OAuth2 (Bearer) - token zdobywany
 * tym samym mechanizmem `private_key_jwt` co Zdarzenia Medyczne (`@p1/medical-events`).
 */

export * from "./constants.js";
export * from "./types.js";
export * from "./client.js";
