import {
  err,
  ok,
  type OperationOutcome,
  type P1Error,
  P1TransportError,
  type Result,
} from "@p1/core";
import { CDA_OID } from "@p1/cda";
import {
  buildSoapEnvelope,
  parseSoapResponse,
  type ParsedSoapResponse,
  signWsSecurity,
} from "@p1/transport";
import {
  PRESCRIPTION_CONTEXT_NAMESPACE,
  PRESCRIPTION_CONTEXT_URN_PREFIX,
  PRESCRIPTION_MT_NS,
  type PrescriptionTransport,
  PRESCRIPTION_WS_NS,
} from "./submit.js";
import { collectRecords, fieldText, findText } from "./xml-walk.js";

/** Namespace `wspolne` (extension/root identyfikatorów OID) dla e-recepty. */
export const PRESCRIPTION_COMMON_NS = "http://csioz.gov.pl/p1/wspolne/mt/v20170510";

const SOAP_ACTION_SEARCH = "urn:wyszukanieReceptUslugobiorcy";
const SOAP_ACTION_READ = "urn:odczytRecepty";

/** Transport dla operacji odczytowych - jak `PrescriptionTransport`, ale bez podpisu CDA. */
export type PrescriptionQueryTransport = Omit<PrescriptionTransport, "documentSigner">;

/** Status recepty w P1 (`StatusReceptyEnumMT`). */
export type PrescriptionStatus =
  | "WYSTAWIONA"
  | "ZABLOKOWANA"
  | "ZREALIZOWANA"
  | "CZESCIOWO_ZREALIZOWANA"
  | "ANULOWANA";

/** Kryteria wyszukiwania recept usługobiorcy (pacjenta). Wymagany jest PESEL. */
export interface PatientPrescriptionSearchCriteria {
  /** PESEL pacjenta (usługobiorcy), dla którego wystawiono recepty. */
  pesel: string;
  /** Dolne ograniczenie daty wystawienia. */
  issuedFrom?: Date;
  /** Górne ograniczenie daty wystawienia. */
  issuedTo?: Date;
  /** Filtr po wystawiającym (NPWZ pracownika medycznego). */
  practitionerNpwz?: string;
  /** Filtr po statusie recepty. */
  status?: PrescriptionStatus;
}

/** Pojedynczy wynik wyszukiwania recepty pacjenta. */
export interface PatientPrescriptionSummary {
  /** `kluczRecepty` - klucz dostępowy do odczytu recepty (`readPrescription`). */
  readonly prescriptionKey: string;
  /** `kluczPakietu` - klucz pakietu zawierającego receptę. */
  readonly packageKey?: string;
  /** `dataWystawieniaRecepty` - moment zapisu recepty w P1 (ISO dateTime). */
  readonly issuedAt?: string;
  /** `numerRecepty` (root + extension) nadany przez usługodawcę. */
  readonly prescriptionNumber?: { root: string; extension: string };
  /** `statusRecepty`. */
  readonly status?: string;
  /** `przyczynaZablokowaniaRecepty` (gdy zablokowana). */
  readonly blockReason?: string;
  /** `podmiotNazwa` - nazwa podmiotu wystawiającego. */
  readonly providerName?: string;
  /** `wystawcaNazwa` - nazwa wystawcy (lekarza). */
  readonly issuerName?: string;
  /** NPWZ wystawcy (`identyfikatorPracownikaWystawcy`). */
  readonly issuerNpwz?: string;
}

export interface PatientPrescriptionSearchResult {
  readonly prescriptions: readonly PatientPrescriptionSummary[];
  readonly outcome?: OperationOutcome;
}

/** Treść odczytanej recepty (`odczytRecepty`). */
export interface PrescriptionContent {
  /** `statusRecepty`. */
  readonly status?: string;
  /** `identyfikatorDokumentuWPakiecie`. */
  readonly documentIdInPackage?: string;
  /** Dokument CDA recepty (odkodowany z base64 `tresc`). */
  readonly cdaXml?: string;
  readonly outcome?: OperationOutcome;
}

/**
 * Wyszukuje recepty pacjenta (operacja `wyszukanieReceptUslugobiorcy`).
 * Zwraca listę podsumowań z `kluczRecepty` - klucz przekaż do `readPrescription`,
 * by pobrać treść CDA. Koperta SOAP + WS-Security (dialekt e-recepty) → mTLS.
 */
export async function searchPatientPrescriptions(
  criteria: PatientPrescriptionSearchCriteria,
  transport: PrescriptionQueryTransport,
): Promise<Result<PatientPrescriptionSearchResult, P1Error>> {
  const body =
    `<ws:WyszukanieReceptUslugobiorcyRequest><kryteriaWyszukiwaniaReceptUslugobiorcy>` +
    (criteria.issuedTo
      ? `<r:dataWystawieniaReceptyDo>${criteria.issuedTo.toISOString()}</r:dataWystawieniaReceptyDo>`
      : "") +
    (criteria.issuedFrom
      ? `<r:dataWystawieniaReceptyOd>${criteria.issuedFrom.toISOString()}</r:dataWystawieniaReceptyOd>`
      : "") +
    (criteria.practitionerNpwz
      ? `<r:idPracownikaMedycznego>${oid(criteria.practitionerNpwz, CDA_OID.NPWZ)}</r:idPracownikaMedycznego>`
      : "") +
    `<r:idUslugobiorcy>${oid(criteria.pesel, CDA_OID.PESEL)}</r:idUslugobiorcy>` +
    (criteria.status ? `<r:statusRecepty>${criteria.status}</r:statusRecepty>` : "") +
    `</kryteriaWyszukiwaniaReceptUslugobiorcy></ws:WyszukanieReceptUslugobiorcyRequest>`;

  const parsed = await callService(body, SOAP_ACTION_SEARCH, transport);
  if (!parsed.ok) return parsed;

  const nodes = collectRecords(parsed.value.body, "wynikWyszukiwaniaReceptUslugobiorcy");
  const prescriptions = nodes
    .map((node) => toSummary(node))
    .filter((s): s is PatientPrescriptionSummary => s !== undefined);

  return ok({
    prescriptions,
    ...(parsed.value.outcome !== undefined ? { outcome: parsed.value.outcome } : {}),
  });
}

/**
 * Odczytuje treść recepty po kluczu (operacja `odczytRecepty`). `prescriptionKey`
 * pochodzi z `searchPatientPrescriptions`. Zwraca dokument CDA (odkodowany z base64).
 */
export async function readPrescription(
  prescriptionKey: string,
  transport: PrescriptionQueryTransport,
): Promise<Result<PrescriptionContent, P1Error>> {
  const body =
    `<ws:OdczytReceptyRequest>` +
    `<kluczRecepty><r:kluczRecepty>${escapeXml(prescriptionKey)}</r:kluczRecepty></kluczRecepty>` +
    `</ws:OdczytReceptyRequest>`;

  const parsed = await callService(body, SOAP_ACTION_READ, transport);
  if (!parsed.ok) return parsed;

  const recepta = collectRecords(parsed.value.body, "recepta")[0];
  const base64 = recepta ? fieldText(recepta, "tresc") : undefined;
  const status = findText(parsed.value.body, "statusRecepty");
  const documentIdInPackage = recepta
    ? fieldText(recepta, "identyfikatorDokumentuWPakiecie")
    : undefined;

  return ok({
    ...(status !== undefined ? { status } : {}),
    ...(documentIdInPackage !== undefined ? { documentIdInPackage } : {}),
    ...(base64 ? { cdaXml: Buffer.from(base64, "base64").toString("utf8") } : {}),
    ...(parsed.value.outcome !== undefined ? { outcome: parsed.value.outcome } : {}),
  });
}

/** Wspólna wysyłka koperty (kontekst e-recepty + WS-Security + mTLS) i parsowanie. */
async function callService(
  body: string,
  soapAction: string,
  transport: PrescriptionQueryTransport,
): Promise<Result<ParsedSoapResponse, P1Error>> {
  const envelope = buildSoapEnvelope({
    context: transport.context,
    body,
    namespaces: { ws: PRESCRIPTION_WS_NS, r: PRESCRIPTION_MT_NS, wsp: PRESCRIPTION_COMMON_NS },
    contextNamespace: PRESCRIPTION_CONTEXT_NAMESPACE,
    contextUrnPrefix: PRESCRIPTION_CONTEXT_URN_PREFIX,
  });

  const now = transport.clock?.now();
  const signed = signWsSecurity(envelope, {
    certificate: transport.wsSecurityCertificate,
    contextNamespace: PRESCRIPTION_CONTEXT_NAMESPACE,
    ...(now !== undefined ? { now } : {}),
  });

  let responseBody: string;
  try {
    const response = await transport.httpClient.send({
      url: transport.endpoint,
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: soapAction },
      body: signed,
    });
    responseBody = response.body;
  } catch (cause) {
    return err(
      new P1TransportError(`Prescription query (${soapAction}) request failed`, { cause }),
    );
  }

  return parseSoapResponse(responseBody);
}

/** Buduje blok identyfikatora OID (kolejność: extension, root - jak w XSD). */
function oid(extension: string, root: string): string {
  return `<wsp:extension>${escapeXml(extension)}</wsp:extension><wsp:root>${escapeXml(root)}</wsp:root>`;
}

function toSummary(node: Record<string, unknown>): PatientPrescriptionSummary | undefined {
  const prescriptionKey = fieldText(node, "kluczRecepty");
  if (prescriptionKey === undefined) return undefined;

  const numerRecepty = node["numerRecepty"];
  const prescriptionNumber =
    numerRecepty && typeof numerRecepty === "object"
      ? {
          root: fieldText(numerRecepty as Record<string, unknown>, "root") ?? "",
          extension: fieldText(numerRecepty as Record<string, unknown>, "extension") ?? "",
        }
      : undefined;

  const issuer = node["identyfikatorPracownikaWystawcy"];
  const issuerNpwz =
    issuer && typeof issuer === "object"
      ? fieldText(issuer as Record<string, unknown>, "extension")
      : undefined;

  return {
    prescriptionKey,
    ...optional("packageKey", fieldText(node, "kluczPakietu")),
    ...optional("issuedAt", fieldText(node, "dataWystawieniaRecepty")),
    ...(prescriptionNumber ? { prescriptionNumber } : {}),
    ...optional("status", fieldText(node, "statusRecepty")),
    ...optional("blockReason", fieldText(node, "przyczynaZablokowaniaRecepty")),
    ...optional("providerName", fieldText(node, "podmiotNazwa")),
    ...optional("issuerName", fieldText(node, "wystawcaNazwa")),
    ...optional("issuerNpwz", issuerNpwz),
  };
}

function optional<K extends string>(key: K, value: string | undefined): Record<K, string> | object {
  return value !== undefined ? { [key]: value } : {};
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
