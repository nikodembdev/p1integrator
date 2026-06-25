import {
  type CallContext,
  type Clock,
  err,
  type HttpClient,
  type P1Error,
  P1TransportError,
  type Result,
} from "@p1/core";
import { SOAP12_NS } from "./constants.js";
import { type ParsedSoapResponse, parseSoapResponse } from "./response-parser.js";
import { buildSoapEnvelope } from "./soap-envelope.js";
import { signWsSecurity, type WsSecurityCertificate } from "./ws-security.js";

/** Wersja bindingu SOAP usługi P1 - decyduje o namespace koperty i nagłówkach HTTP. */
export type SoapVersion = "1.1" | "1.2";

/**
 * Wspólne zależności transportu dla pojedynczego wywołania SOAP P1. Każdy moduł
 * domenowy (`ReferralTransport`, `IpomTransport`, ...) definiuje własny typ z tymi
 * polami - strukturalnie pasuje do `SoapCallTransport`, więc można go przekazać wprost.
 */
export interface SoapCallTransport {
  readonly context: CallContext;
  /** Klient HTTP z mTLS. */
  readonly httpClient: HttpClient;
  /** Certyfikat do podpisu WS-Security koperty. */
  readonly wsSecurityCertificate: WsSecurityCertificate;
  /** Endpoint SOAP usługi (zależny od środowiska). */
  readonly endpoint: string;
  /** Zegar - do deterministycznego Timestamp w testach. */
  readonly clock?: Clock;
}

export interface SoapCallOptions {
  /** Wewnętrzny XML elementu Body (żądanie operacji) - buduje moduł domenowy. */
  readonly body: string;
  /** Identyfikator operacji SOAP (`urn:...`): nagłówek SOAPAction (1.1) / parametr `action` (1.2). */
  readonly soapAction: string;
  /** Dodatkowe deklaracje namespace na `<Envelope>` (prefiks → URI). */
  readonly namespaces?: Readonly<Record<string, string>>;
  /** Wersja bindingu SOAP (domyślnie `"1.1"`). */
  readonly soapVersion?: SoapVersion;
  /**
   * Namespace elementu `kontekstWywolania` - przekazywany spójnie do koperty i podpisu
   * WS-Security. Domyślnie e-skierowanie (v20180509); e-recepta używa v20170510.
   */
  readonly contextNamespace?: string;
  /** Prefiks URN nazw atrybutów kontekstu (domyślnie e-skierowanie). */
  readonly contextUrnPrefix?: string;
  /** Komunikat `P1TransportError`, gdy samo żądanie HTTP zawiedzie. */
  readonly transportErrorMessage: string;
}

/**
 * Wspólna orkiestracja jednego wywołania SOAP P1: koperta → podpis WS-Security
 * (z opcjonalnym wstrzykiwanym zegarem) → mTLS POST → parsowanie odpowiedzi.
 *
 * Kroki specyficzne dla operacji - podpis XAdES dokumentu CDA, budowa Body oraz
 * ekstrakcja pól z `WynikMT`/Body - zostają w module domenowym; tu jest tylko
 * niezmienny ogon powtarzany przez wszystkie usługi (referral/prescription/ipom...).
 */
export async function sendSignedSoap(
  transport: SoapCallTransport,
  options: SoapCallOptions,
): Promise<Result<ParsedSoapResponse, P1Error>> {
  const soap12 = options.soapVersion === "1.2";

  const envelope = buildSoapEnvelope({
    context: transport.context,
    body: options.body,
    ...(options.namespaces !== undefined ? { namespaces: options.namespaces } : {}),
    ...(options.contextNamespace !== undefined
      ? { contextNamespace: options.contextNamespace }
      : {}),
    ...(options.contextUrnPrefix !== undefined
      ? { contextUrnPrefix: options.contextUrnPrefix }
      : {}),
    ...(soap12 ? { soapNamespace: SOAP12_NS } : {}),
  });

  const now = transport.clock?.now();
  const signed = signWsSecurity(envelope, {
    certificate: transport.wsSecurityCertificate,
    ...(now !== undefined ? { now } : {}),
    ...(options.contextNamespace !== undefined
      ? { contextNamespace: options.contextNamespace }
      : {}),
  });

  // SOAP 1.1: action w nagłówku SOAPAction. SOAP 1.2: action w parametrze Content-Type.
  const headers: Readonly<Record<string, string>> = soap12
    ? { "Content-Type": `application/soap+xml; charset=utf-8; action="${options.soapAction}"` }
    : { "Content-Type": "text/xml; charset=utf-8", SOAPAction: options.soapAction };

  let responseBody: string;
  try {
    const response = await transport.httpClient.send({
      url: transport.endpoint,
      method: "POST",
      headers,
      body: signed,
    });
    responseBody = response.body;
  } catch (cause) {
    return err(new P1TransportError(options.transportErrorMessage, { cause }));
  }

  return parseSoapResponse(responseBody);
}
