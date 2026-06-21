/**
 * @p1/edm - Elektroniczna Dokumentacja Medyczna (IHE XDS.b + token SAML).
 *
 * Zakres docelowy: operacje rejestru (ITI-42 zapis indeksu, ITI-18 wyszukanie,
 * ITI-57 aktualizacja), repozytorium (ITI-41 zapis treści, ITI-43 pobranie),
 * token SAML (generujToken), rejestracja danych dostępowych (SZAR), audyt ATNA
 * (ITI-20) i weryfikacja zgód (SOZ). Samo przechowywanie treści zostaje po stronie
 * konsumenta (port DocumentStore) - biblioteka daje całą maszynerię protokołu.
 */

export * from "./types.js";
export * from "./document-store.js";
export * from "./saml-token.js";
export * from "./ebrim.js";
export * from "./soap-edm.js";
export * from "./iti42.js";
export * from "./iti18.js";
