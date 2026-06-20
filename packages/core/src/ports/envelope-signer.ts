/** Elementy koperty SOAP objęte podpisem WS-Security (po `wsu:Id`). */
export interface WsSecurityTargets {
  /** Identyfikatory `wsu:Id` elementów do podpisania (np. Body, Kontekst, Timestamp). */
  readonly referencedIds: readonly string[];
}

/**
 * Port podpisu WS-Security koperty SOAP (XML-DSig, RSA-SHA256).
 * W odróżnieniu od `DocumentSigner` (XAdES dokumentu) - to podpis *koperty*,
 * realizowany pure-JS (xml-crypto) w `@p1/transport`.
 */
export interface EnvelopeSigner {
  signWsSecurity(envelopeXml: string, targets: WsSecurityTargets): Promise<string>;
}
