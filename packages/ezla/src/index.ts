/**
 * @p1/ezla - e-ZLA (ZUS): elektroniczne zaświadczenia lekarskie / e-zwolnienia.
 *
 * UWAGA: to integracja z **ZUS** (kanał gabinetowy, SOAP), NIE z P1. Inny stack:
 * koperta SOAP 1.1 + HTTP Basic Auth + logowanie podpisem (sesja `IdSesji`) +
 * dokumenty KED ZLA podpisywane XML-DSig (enveloped). Skeleton modułu -
 * patrz [[ezla-zus]] (katalog dokumentacji w `.local/ezwolnienia-docs`).
 */

export * from "./constants.js";
export * from "./types.js";
export * from "./transport.js";
export * from "./session.js";
export * from "./zla-document.js";
export * from "./documents.js";
export * from "./read.js";
export * from "./signer.js";
