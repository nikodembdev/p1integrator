/**
 * Port podpisu dokumentu (CDA) w formacie XAdES-BES (enveloped).
 * Domyślny adapter woła zewnętrzny serwis Java/DSS; można podmienić na pure-JS.
 */
export interface DocumentSigner {
  /** Przyjmuje XML dokumentu, zwraca ten sam dokument podpisany XAdES-BES. */
  signXades(documentXml: string): Promise<string>;
}
