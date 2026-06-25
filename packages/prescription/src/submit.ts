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
import {
  buildPrescriptionCancellationCda,
  type PrescriptionCancellationInput,
} from "./anulowanie.js";
import { buildDrugPrescriptionCda } from "./document.js";
import type { DrugPrescriptionInput } from "./types.js";
import { collectRecords, findText } from "./xml-walk.js";

/** Namespace usługi ObslugaRecepty (v20170510 - inny niż e-skierowanie!). */
export const PRESCRIPTION_WS_NS = "http://csioz.gov.pl/p1/erecepta/ws/v20170510";
export const PRESCRIPTION_MT_NS = "http://csioz.gov.pl/p1/erecepta/mt/v20170510";
/** Namespace `kontekstWywolania` dla e-recepty (wersja v20170510). */
export const PRESCRIPTION_CONTEXT_NAMESPACE = "http://csioz.gov.pl/p1/kontekst/mt/v20170510";
/** Prefiks URN nazw atrybutów kontekstu e-recepty. */
export const PRESCRIPTION_CONTEXT_URN_PREFIX = "urn:csioz:p1:erecepta:kontekst:";

const SOAP_ACTION = "urn:zapisPakietuRecept";
const SOAP_ACTION_CANCEL = "urn:zapisDokumentuAnulowaniaRecepty";

/**
 * Zależności transportu dla wysyłki pakietu recept (operacja `zapisPakietuRecept`).
 * Analogiczne do `ReferralTransport`, ale z dialektem kontekstu e-recepty.
 */
export interface PrescriptionTransport {
  readonly context: CallContext;
  /** Podpis XAdES dokumentu CDA (port DocumentSigner). */
  readonly documentSigner: DocumentSigner;
  /** Klient HTTP z mTLS. */
  readonly httpClient: HttpClient;
  /** Certyfikat do podpisu WS-Security koperty. */
  readonly wsSecurityCertificate: WsSecurityCertificate;
  /** Endpoint SOAP usługi ObslugaReceptyWS (zależny od środowiska). */
  readonly endpoint: string;
  /** Zegar - do deterministycznego Timestamp w testach. */
  readonly clock?: Clock;
}

/** Pojedyncza recepta do umieszczenia w pakiecie. */
export interface PrescriptionInPackage {
  /** Identyfikator recepty w pakiecie (`identyfikatorDokumentuWPakiecie`). */
  readonly id: number;
  /** Surowy (niepodpisany) dokument CDA recepty. */
  readonly cdaXml: string;
}

/** Wynik zapisu pojedynczej recepty z pakietu. */
export interface PrescriptionResult {
  /** `numerReceptyWPakiecie` - koreluje z `id` przekazanej recepty. */
  readonly id?: string;
  /** `kluczRecepty` - klucz dostępowy nadany przez P1 (gdy weryfikacja OK). */
  readonly key?: string;
}

export interface PrescriptionPackageResult {
  /** `kodPakietuRecept` - 4 cyfry + PESEL (gdy całość zweryfikowana bezbłędnie). */
  readonly packageCode?: string;
  /** `kluczPakietuRecept` - klucz pakietu (gdy całość zweryfikowana bezbłędnie). */
  readonly packageKey?: string;
  /** Klucze poszczególnych recept. */
  readonly prescriptions: readonly PrescriptionResult[];
  /** Wynik biznesowy operacji (WynikMT). */
  readonly outcome?: OperationOutcome;
}

/**
 * Wysyła pakiet recept operacją `zapisPakietuRecept`: każda recepta jest
 * podpisywana XAdES i kodowana base64 do `<r:tresc>`, opakowana w
 * `pakietRecept/recepty/recepta`; koperta SOAP + WS-Security (dialekt kontekstu
 * e-recepty) → mTLS → parsowanie `WynikMT` + kluczy pakietu/recept.
 */
export async function submitPrescriptionPackage(
  prescriptions: readonly PrescriptionInPackage[],
  transport: PrescriptionTransport,
): Promise<Result<PrescriptionPackageResult, P1Error>> {
  const receptyXml: string[] = [];
  for (const prescription of prescriptions) {
    const signedCda = await transport.documentSigner.signXades(prescription.cdaXml);
    const base64 = Buffer.from(signedCda, "utf8").toString("base64");
    receptyXml.push(
      `<r:recepta>` +
        `<r:identyfikatorDokumentuWPakiecie>${prescription.id}</r:identyfikatorDokumentuWPakiecie>` +
        `<r:tresc>${base64}</r:tresc>` +
        `</r:recepta>`,
    );
  }

  const body =
    `<ws:ZapisPakietuReceptRequest><pakietRecept>` +
    `<r:recepty>${receptyXml.join("")}</r:recepty>` +
    `</pakietRecept></ws:ZapisPakietuReceptRequest>`;

  const parsed = await sendSignedSoap(transport, {
    body,
    soapAction: SOAP_ACTION,
    namespaces: { ws: PRESCRIPTION_WS_NS, r: PRESCRIPTION_MT_NS },
    contextNamespace: PRESCRIPTION_CONTEXT_NAMESPACE,
    contextUrnPrefix: PRESCRIPTION_CONTEXT_URN_PREFIX,
    transportErrorMessage: "Prescription package submission request failed",
  });
  if (!parsed.ok) return parsed;

  const packageCode = findText(parsed.value.body, "kodPakietuRecept");
  const packageKey = findText(parsed.value.body, "kluczPakietuRecept");
  return ok({
    ...(packageCode !== undefined ? { packageCode } : {}),
    ...(packageKey !== undefined ? { packageKey } : {}),
    prescriptions: extractPrescriptionResults(parsed.value.body),
    ...(parsed.value.outcome !== undefined ? { outcome: parsed.value.outcome } : {}),
  });
}

/** Buduje CDA recepty z `input` i wysyła ją jako jednoelementowy pakiet. */
export async function issueDrugPrescription(
  input: DrugPrescriptionInput,
  transport: PrescriptionTransport,
): Promise<Result<PrescriptionPackageResult, P1Error>> {
  const { xml } = buildDrugPrescriptionCda(input);
  return submitPrescriptionPackage([{ id: 1, cdaXml: xml }], transport);
}

export interface PrescriptionCancellationSubmissionResult {
  /** Wynik biznesowy operacji (WynikMT). */
  readonly outcome?: OperationOutcome;
}

/**
 * Anuluje receptę operacją `zapisDokumentuAnulowaniaRecepty`: podpisuje CDA
 * anulujący (XAdES, base64 w `tresc`) i przekazuje go wraz z `kluczRecepty`
 * (klucz dostępowy nadany przy wystawieniu) → koperta SOAP + WS-Security (dialekt
 * e-recepty) → mTLS → parsowanie `WynikMT`.
 */
export async function submitPrescriptionCancellation(
  cancellationCdaXml: string,
  kluczRecepty: string,
  transport: PrescriptionTransport,
): Promise<Result<PrescriptionCancellationSubmissionResult, P1Error>> {
  const signed = await transport.documentSigner.signXades(cancellationCdaXml);
  const base64 = Buffer.from(signed, "utf8").toString("base64");

  const body =
    `<ws:ZapisDokumentuAnulowaniaReceptyRequest>` +
    `<kluczRecepty><r:kluczRecepty>${kluczRecepty}</r:kluczRecepty></kluczRecepty>` +
    `<dokumentAnulowaniaRecepty><r:tresc>${base64}</r:tresc></dokumentAnulowaniaRecepty>` +
    `</ws:ZapisDokumentuAnulowaniaReceptyRequest>`;

  const parsed = await sendSignedSoap(transport, {
    body,
    soapAction: SOAP_ACTION_CANCEL,
    namespaces: { ws: PRESCRIPTION_WS_NS, r: PRESCRIPTION_MT_NS },
    contextNamespace: PRESCRIPTION_CONTEXT_NAMESPACE,
    contextUrnPrefix: PRESCRIPTION_CONTEXT_URN_PREFIX,
    transportErrorMessage: "Prescription cancellation request failed",
  });
  if (!parsed.ok) return parsed;
  return ok(parsed.value.outcome !== undefined ? { outcome: parsed.value.outcome } : {});
}

/** Buduje dokument anulujący z `input` i wysyła go wraz z `kluczRecepty`. */
export async function cancelDrugPrescription(
  input: PrescriptionCancellationInput,
  kluczRecepty: string,
  transport: PrescriptionTransport,
): Promise<Result<PrescriptionCancellationSubmissionResult, P1Error>> {
  const { xml } = buildPrescriptionCancellationCda(input);
  return submitPrescriptionCancellation(xml, kluczRecepty, transport);
}

/** Wyciąga klucze poszczególnych recept z `weryfikowanaRecepta`. */
function extractPrescriptionResults(body: unknown): PrescriptionResult[] {
  const nodes = collectRecords(body, "weryfikowanaRecepta");
  return nodes.map((node) => {
    const id = findText(node, "numerReceptyWPakiecie");
    const key = findText(node, "kluczRecepty");
    return {
      ...(id !== undefined ? { id } : {}),
      ...(key !== undefined ? { key } : {}),
    };
  });
}
