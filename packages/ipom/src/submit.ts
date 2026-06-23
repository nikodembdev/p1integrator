import {
  type CallContext,
  type Clock,
  type DocumentSigner,
  err,
  type HttpClient,
  ok,
  type OperationOutcome,
  type P1Error,
  P1TransportError,
  type Result,
} from "@p1/core";
import {
  buildSoapEnvelope,
  parseSoapResponse,
  SOAP12_NS,
  signWsSecurity,
  type WsSecurityCertificate,
} from "@p1/transport";
import { buildIpomCancellationCda, type IpomCancellationInput } from "./anulowanie.js";
import { buildIpomCda } from "./document.js";
import type { IpomInput } from "./types.js";

/** Namespace usługi ObslugaPlanowOpiekiMedycznejWS (IPOM/POM, wersja v20220516). */
export const IPOM_WS_NS = "http://csioz.gov.pl/p1/ipom/ws/v20220516";
export const IPOM_MT_NS = "http://csioz.gov.pl/p1/ipom/mt/v20220516";

const SOAP_ACTION_SAVE_PLAN = "urn:zapisPlanuOpiekiMedycznej";
const SOAP_ACTION_CANCEL_PLAN = "urn:zapisAnulowaniaPlanuOpiekiMedycznej";

/**
 * Zależności transportu dla zapisu planu opieki medycznej (operacja
 * `zapisPlanuOpiekiMedycznej`). IPOM używa standardowego dialektu kontekstu
 * (v20180509, jak e-skierowanie), więc bez nadpisań namespace kontekstu.
 */
export interface IpomTransport {
  readonly context: CallContext;
  /** Podpis XAdES dokumentu CDA (port DocumentSigner). */
  readonly documentSigner: DocumentSigner;
  /** Klient HTTP z mTLS. */
  readonly httpClient: HttpClient;
  /** Certyfikat do podpisu WS-Security koperty. */
  readonly wsSecurityCertificate: WsSecurityCertificate;
  /** Endpoint SOAP usługi ObslugaPlanowOpiekiMedycznejWS (zależny od środowiska). */
  readonly endpoint: string;
  /** Zegar - do deterministycznego Timestamp w testach. */
  readonly clock?: Clock;
}

/** Wynik weryfikacji pojedynczej reguły P1 (REG.WER.*) zwrócony w odpowiedzi zapisu. */
export interface IpomRuleResult {
  /** Kod reguły, np. „REG.WER.13453". */
  readonly code?: string;
  /** Wynik weryfikacji reguły (`...pozytywny` / `...blad` / `...ostrzezenie`). */
  readonly result?: string;
  /** Opis znalezionego problemu (błędu albo ostrzeżenia). */
  readonly description?: string;
  /** Wskazanie miejsca w dokumencie, gdzie znaleziono problem. */
  readonly location?: string;
}

export interface IpomSubmissionResult {
  /** Zbiorczy wynik weryfikacji dokumentu (`...pozytywny` / `...blad` / `...ostrzezenie`). */
  readonly verification?: string;
  /** Lista wyników weryfikacji poszczególnych reguł (błędy i ostrzeżenia). */
  readonly rules: readonly IpomRuleResult[];
  /** Wynik biznesowy operacji (WynikMT). */
  readonly outcome?: OperationOutcome;
}

/**
 * Wysyła dokument CDA planu opieki medycznej operacją `zapisPlanuOpiekiMedycznej`:
 * podpis XAdES → base64 do `<trescDokumentu>` → koperta SOAP 1.2 + WS-Security
 * (kontekst standardowy) → mTLS → parsowanie WynikMT i wyników weryfikacji reguł.
 */
export function submitIpomDocument(
  cdaXml: string,
  transport: IpomTransport,
): Promise<Result<IpomSubmissionResult, P1Error>> {
  return sendIpomDocument(
    cdaXml,
    "ZapisPlanuOpiekiMedycznejRequest",
    SOAP_ACTION_SAVE_PLAN,
    transport,
    "IPOM document submission request failed",
  );
}

/** Buduje CDA planu z `input` i wysyła go operacją `zapisPlanuOpiekiMedycznej`. */
export async function submitIpom(
  input: IpomInput,
  transport: IpomTransport,
): Promise<Result<IpomSubmissionResult, P1Error>> {
  const { xml } = buildIpomCda(input);
  return submitIpomDocument(xml, transport);
}

/**
 * Wysyła dokument CDA anulujący plan operacją `zapisAnulowaniaPlanuOpiekiMedycznej`
 * (analogicznie do zapisu: podpis XAdES → base64 → koperta SOAP 1.2 → mTLS → WynikMT).
 */
export function submitIpomCancellationDocument(
  cancellationCdaXml: string,
  transport: IpomTransport,
): Promise<Result<IpomSubmissionResult, P1Error>> {
  return sendIpomDocument(
    cancellationCdaXml,
    "ZapisAnulowaniaPlanuOpiekiMedycznejRequest",
    SOAP_ACTION_CANCEL_PLAN,
    transport,
    "IPOM cancellation request failed",
  );
}

/** Buduje dokument anulujący z `input` i wysyła go operacją `zapisAnulowaniaPlanuOpiekiMedycznej`. */
export async function submitIpomCancellation(
  input: IpomCancellationInput,
  transport: IpomTransport,
): Promise<Result<IpomSubmissionResult, P1Error>> {
  const { xml } = buildIpomCancellationCda(input);
  return submitIpomCancellationDocument(xml, transport);
}

/**
 * Wspólna wysyłka dokumentu IPOM (zapis/anulowanie): podpis XAdES + base64 →
 * `<ws:{requestRoot}><trescDokumentu>...</trescDokumentu></ws:{requestRoot}>` →
 * koperta SOAP 1.2 + WS-Security → mTLS → parsowanie WynikMT i reguł weryfikacji.
 */
async function sendIpomDocument(
  cdaXml: string,
  requestRoot: string,
  soapAction: string,
  transport: IpomTransport,
  transportErrorMessage: string,
): Promise<Result<IpomSubmissionResult, P1Error>> {
  const signedCda = await transport.documentSigner.signXades(cdaXml);
  const base64 = Buffer.from(signedCda, "utf8").toString("base64");

  const body =
    `<ws:${requestRoot}>` + `<trescDokumentu>${base64}</trescDokumentu>` + `</ws:${requestRoot}>`;

  // IPOM ma binding soap12 - koperta w namespace SOAP 1.2; action idzie w Content-Type.
  const envelope = buildSoapEnvelope({
    context: transport.context,
    body,
    namespaces: { ws: IPOM_WS_NS },
    soapNamespace: SOAP12_NS,
  });

  const now = transport.clock?.now();
  const signed = signWsSecurity(
    envelope,
    now !== undefined
      ? { certificate: transport.wsSecurityCertificate, now }
      : { certificate: transport.wsSecurityCertificate },
  );

  let responseBody: string;
  try {
    const response = await transport.httpClient.send({
      url: transport.endpoint,
      method: "POST",
      headers: { "Content-Type": `application/soap+xml; charset=utf-8; action="${soapAction}"` },
      body: signed,
    });
    responseBody = response.body;
  } catch (cause) {
    return err(new P1TransportError(transportErrorMessage, { cause }));
  }

  const parsed = parseSoapResponse(responseBody);
  if (!parsed.ok) return parsed;

  const verification = findText(parsed.value.body, "wynikWeryfikacji");
  return ok({
    ...(verification !== undefined ? { verification } : {}),
    rules: extractRuleResults(parsed.value.body),
    ...(parsed.value.outcome !== undefined ? { outcome: parsed.value.outcome } : {}),
  });
}

/** Wyciąga wyniki weryfikacji poszczególnych reguł (`wynikWeryfikacjiReguly`). */
function extractRuleResults(body: unknown): IpomRuleResult[] {
  return collectRecords(body, "wynikWeryfikacjiReguly").map((node) => {
    const code = findText(node, "kodRegulyWeryfikacji");
    const result = findText(node, "wynikWeryfikacji");
    const description = findText(node, "opisProblemu");
    const location = findText(node, "miejsceWystapieniaBledu");
    return {
      ...(code !== undefined ? { code } : {}),
      ...(result !== undefined ? { result } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(location !== undefined ? { location } : {}),
    };
  });
}

/** Zbiera wszystkie węzły o danym kluczu (płaska lista), niezależnie od zagnieżdżenia. */
function collectRecords(node: unknown, key: string): unknown[] {
  const out: unknown[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const [k, v] of Object.entries(record)) {
        if (k === key) {
          if (Array.isArray(v)) out.push(...(v as unknown[]));
          else out.push(v);
        } else {
          visit(v);
        }
      }
    }
  };
  visit(node);
  return out;
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
