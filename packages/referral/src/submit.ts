import {
  type CallContext,
  type Clock,
  type DocumentSigner,
  type HttpClient,
  ok,
  type OperationOutcome,
  type P1Error,
  type Result,
} from "@p1/core";
import { sendSignedSoap, type WsSecurityCertificate } from "@p1/transport";

const WS_NS = "http://csioz.gov.pl/p1/eskierowanie/ws/v20180509";
const MT_NS = "http://csioz.gov.pl/p1/eskierowanie/mt/v20180509";
const SOAP_ACTION = "urn:zapisDokumentuSkierowania";

/**
 * Zależności transportu dla wysyłki skierowania - wspólne dla wszystkich typów
 * skierowań (operacja SOAP `zapisDokumentuSkierowania` jest jedna).
 */
export interface ReferralTransport {
  readonly context: CallContext;
  /** Podpis XAdES dokumentu CDA (np. adapter Java/DSS z @p1/signing). */
  readonly documentSigner: DocumentSigner;
  /** Klient HTTP z mTLS (np. adapter z @p1/transport). */
  readonly httpClient: HttpClient;
  /** Certyfikat do podpisu WS-Security koperty. */
  readonly wsSecurityCertificate: WsSecurityCertificate;
  /** Endpoint SOAP usługi e-Skierowania (zależny od środowiska). */
  readonly endpoint: string;
  /** Zegar - do deterministycznego Timestamp w testach. */
  readonly clock?: Clock;
}

export interface ReferralSubmissionResult {
  /** kodSkierowania (4-cyfrowy kod dostępowy). */
  readonly referralCode?: string;
  /** kluczSkierowania (klucz dostępowy). */
  readonly referralKey?: string;
  /** Wynik biznesowy operacji (WynikMT). */
  readonly outcome?: OperationOutcome;
}

/**
 * Wysyła dokument CDA skierowania (dowolnego typu) operacją `zapisDokumentuSkierowania`:
 * podpis XAdES → koperta SOAP + WS-Security → mTLS → parsowanie odpowiedzi.
 * CDA jest podpisywany i kodowany base64 do elementu `tresc`.
 */
export async function submitReferralDocument(
  cdaXml: string,
  transport: ReferralTransport,
): Promise<Result<ReferralSubmissionResult, P1Error>> {
  const signedCda = await transport.documentSigner.signXades(cdaXml);
  const base64 = Buffer.from(signedCda, "utf8").toString("base64");

  const body =
    `<ws:ZapisDokumentuSkierowaniaRequest><dokumentSkierowania>` +
    `<mt:tresc>${base64}</mt:tresc>` +
    `</dokumentSkierowania></ws:ZapisDokumentuSkierowaniaRequest>`;

  const parsed = await sendSignedSoap(transport, {
    body,
    soapAction: SOAP_ACTION,
    namespaces: { ws: WS_NS, mt: MT_NS },
    transportErrorMessage: "Referral submission request failed",
  });
  if (!parsed.ok) return parsed;

  const referralCode = findText(parsed.value.body, "kodSkierowania");
  const referralKey = findText(parsed.value.body, "kluczSkierowania");
  return ok({
    ...(referralCode !== undefined ? { referralCode } : {}),
    ...(referralKey !== undefined ? { referralKey } : {}),
    ...(parsed.value.outcome !== undefined ? { outcome: parsed.value.outcome } : {}),
  });
}

function findText(node: unknown, key: string): string | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findText(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (node !== null && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (key in record) return coerce(record[key]);
    for (const value of Object.values(record)) {
      const found = findText(value, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function coerce(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("#text" in record) return coerce(record["#text"]);
    for (const inner of Object.values(record)) {
      const found = coerce(inner);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}
