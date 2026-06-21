import { type CallContext, CONTEXT_NAMESPACE, contextToAttributes } from "@p1/core";
import { SOAPENV_NS, WSSE_NS, WSU_NS } from "./constants.js";

const KONTEKST_ID = "KontekstWywolania";
const BODY_ID = "Body";

export interface SoapEnvelopeOptions {
  readonly context: CallContext;
  /** Wewnętrzny XML elementu Body (żądanie operacji) — dostarcza moduł domenowy. */
  readonly body: string;
  /** Dodatkowe deklaracje namespace na <Envelope> (prefiks → URI), np. dla operacji. */
  readonly namespaces?: Readonly<Record<string, string>>;
  /**
   * Namespace elementu `kontekstWywolania` (prefiks `kon:`). Domyślnie e-skierowanie
   * (v20180509); e-recepta używa wersji v20170510. Musi być spójny z `contextNamespace`
   * przekazanym do `signWsSecurity`.
   */
  readonly contextNamespace?: string;
  /** Prefiks URN nazw atrybutów kontekstu (domyślnie e-skierowanie). */
  readonly contextUrnPrefix?: string;
}

/**
 * Buduje kopertę SOAP P1 z pustym placeholderem `<wsse:Security>` (wypełnia go
 * `signWsSecurity`), Kontekstem (z `wsu:Id`) i Body (z `wsu:Id`). Czysta funkcja.
 */
export function buildSoapEnvelope(options: SoapEnvelopeOptions): string {
  const extraNamespaces = Object.entries(options.namespaces ?? {})
    .map(([prefix, uri]) => ` xmlns:${prefix}="${uri}"`)
    .join("");
  const contextNamespace = options.contextNamespace ?? CONTEXT_NAMESPACE;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${SOAPENV_NS}" xmlns:kon="${contextNamespace}"` +
    ` xmlns:wsse="${WSSE_NS}" xmlns:wsu="${WSU_NS}"${extraNamespaces}>` +
    `<soapenv:Header>` +
    `<wsse:Security soapenv:mustUnderstand="1"></wsse:Security>` +
    buildKontekstXml(options.context, options.contextUrnPrefix) +
    `</soapenv:Header>` +
    `<soapenv:Body wsu:Id="${BODY_ID}">${options.body}</soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

function buildKontekstXml(context: CallContext, urnPrefix?: string): string {
  const attributes = contextToAttributes(context, urnPrefix)
    .map(
      (attribute) =>
        `<kon:atrybut nazwa="${escapeXml(attribute.name)}">` +
        `<kon:wartosc>${escapeXml(attribute.value)}</kon:wartosc>` +
        `</kon:atrybut>`,
    )
    .join("");
  return `<kon:kontekstWywolania wsu:Id="${KONTEKST_ID}">${attributes}</kon:kontekstWywolania>`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => {
    switch (char) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}
