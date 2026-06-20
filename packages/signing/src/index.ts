/**
 * @p1/signing - adaptery portu DocumentSigner (XAdES-BES):
 * - `createDssDocumentSigner` — zewnętrzny serwis Java/DSS,
 * - `createXadesDocumentSigner` — podpisywarka in-process (xadesjs + WebCrypto).
 * Port `DocumentSigner` jest zdefiniowany w `@p1/core`.
 */

export * from "./dss-document-signer.js";
export * from "./xades-document-signer.js";
