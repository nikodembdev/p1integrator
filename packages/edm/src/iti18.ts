import {
  err,
  type HttpClient,
  ok,
  type P1Error,
  P1BusinessError,
  P1TransportError,
  type Result,
} from "@p1/core";
import type { WsSecurityCertificate } from "@p1/transport";
import { XDS } from "./ebrim.js";
import { buildSignedEdmEnvelope, EBRS_STATUS_SUCCESS, soap12ContentType } from "./soap-edm.js";

/**
 * ITI-18 (Registry Stored Query) - wyszukanie indeksów EDM w rejestrze P1.
 * Predefiniowane zapytania (AdhocQuery) rozróżniane UUID; tu FindDocuments po pacjencie
 * i statusie. Koperta SOAP 1.2 + asercja SAML + podpis (jak ITI-42). Odpowiedź:
 * AdhocQueryResponse z listą DocumentEntry (LeafClass) lub referencji (ObjectRef).
 */

const QUERY_NS = "urn:oasis:names:tc:ebxml-regrep:xsd:query:3.0";
const RIM_NS = "urn:oasis:names:tc:ebxml-regrep:xsd:rim:3.0";
const ACTION = "urn:ihe:iti:2007:RegistryStoredQuery";

/** UUID predefiniowanych zapytań (StoredQuery). */
export const STORED_QUERY = {
  FIND_DOCUMENTS: "urn:uuid:14d4debf-8f97-4251-9a74-a90016b0af0d",
  GET_ALL: "urn:uuid:10b545ea-725c-446d-9b95-8aeb444eddf3",
  FIND_FOLDERS: "urn:uuid:958f3006-baad-4929-a4de-ff1114824431",
  GET_FOLDER_AND_CONTENTS: "urn:uuid:b909a503-523d-4517-8acf-8e5834dfc4c7",
  GET_RELATED_DOCUMENTS: "urn:uuid:d90e5407-b356-4d91-a89f-873917b4b0e6",
} as const;

const STATUS = {
  Approved: "urn:oasis:names:tc:ebxml-regrep:StatusType:Approved",
  Deprecated: "urn:oasis:names:tc:ebxml-regrep:StatusType:Deprecated",
} as const;

/** Domyślny endpoint ITI-18 (środowisko integracyjne). */
export const DEFAULT_ITI18_ENDPOINT = "https://isus.ezdrowie.gov.pl/services/ObslugaEdmIti18WS";

export interface FindDocumentsInput {
  readonly endpoint?: string;
  /** Asercja SAML (z `requestSamlToken`). */
  readonly assertionXml: string;
  readonly wsSecurityCertificate: WsSecurityCertificate;
  /** Identyfikator pacjenta w domenie XDS (CX), np. `pesel^^^&OID&ISO`. */
  readonly patientId: string;
  /** Statusy indeksu (domyślnie [Approved]). */
  readonly statuses?: readonly ("Approved" | "Deprecated")[];
  /** Postać wyniku: pełne obiekty (LeafClass) lub same referencje (ObjectRef). */
  readonly returnType?: "LeafClass" | "ObjectRef";
  readonly now?: Date;
  readonly ttlSeconds?: number;
  readonly idSuffix?: string;
  readonly messageId?: string;
}

/** Pojedynczy znaleziony indeks dokumentu. */
export interface FoundDocument {
  /** id obiektu w rejestrze (urn:uuid:...). */
  readonly entryUuid?: string;
  /** uniqueId dokumentu (root^extension). */
  readonly uniqueId?: string;
  /** Identyfikator repozytorium z treścią. */
  readonly repositoryUniqueId?: string;
  /** Identyfikator powiązanego zdarzenia medycznego (slot MedicalEventId). */
  readonly medicalEventId?: string;
  /** Status dostępności/aktualności. */
  readonly status?: string;
}

export interface FindDocumentsResult {
  readonly success: boolean;
  readonly status?: string;
  readonly documents: readonly FoundDocument[];
  readonly raw: string;
}

const escapeXml = (v: string): string =>
  v.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);

const slot = (name: string, value: string): string =>
  `<rim:Slot name="${name}"><rim:ValueList><rim:Value>${value}</rim:Value></rim:ValueList></rim:Slot>`;

/** Buduje podpisaną kopertę ITI-18 FindDocuments. */
export function buildFindDocumentsRequest(input: FindDocumentsInput): string {
  const returnType = input.returnType ?? "LeafClass";
  const statuses = (input.statuses ?? ["Approved"]).map((s) => `'${STATUS[s]}'`).join(",");

  const bodyXml =
    `<query:AdhocQueryRequest xmlns:query="${QUERY_NS}" xmlns:rim="${RIM_NS}">` +
    `<query:ResponseOption returnComposedObjects="true" returnType="${returnType}"/>` +
    `<rim:AdhocQuery id="${STORED_QUERY.FIND_DOCUMENTS}">` +
    slot("$XDSDocumentEntryPatientId", `'${escapeXml(input.patientId)}'`) +
    slot("$XDSDocumentEntryStatus", `(${escapeXml(statuses)})`) +
    `</rim:AdhocQuery></query:AdhocQueryRequest>`;

  return buildSignedEdmEnvelope({
    action: ACTION,
    endpoint: input.endpoint ?? DEFAULT_ITI18_ENDPOINT,
    bodyXml,
    assertionXml: input.assertionXml,
    certificate: input.wsSecurityCertificate,
    ...(input.now !== undefined ? { now: input.now } : {}),
    ...(input.ttlSeconds !== undefined ? { ttlSeconds: input.ttlSeconds } : {}),
    ...(input.idSuffix !== undefined ? { idSuffix: input.idSuffix } : {}),
    ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
  });
}

/**
 * Wyszukuje indeksy dokumentów pacjenta (ITI-18 FindDocuments) nad mTLS.
 * Zwraca listę znalezionych indeksów (uniqueId, repozytorium, zdarzenie).
 */
export async function findDocuments(
  input: FindDocumentsInput,
  httpClient: HttpClient,
): Promise<Result<FindDocumentsResult, P1Error>> {
  const endpoint = input.endpoint ?? DEFAULT_ITI18_ENDPOINT;
  const body = buildFindDocumentsRequest(input);

  let responseBody: string;
  try {
    const response = await httpClient.send({
      url: endpoint,
      method: "POST",
      headers: { "Content-Type": soap12ContentType(ACTION) },
      body,
    });
    responseBody = response.body;
  } catch (cause) {
    return err(new P1TransportError("ITI-18 RegistryStoredQuery request failed", { cause }));
  }

  const status = /<(?:\w+:)?AdhocQueryResponse\b[^>]*\bstatus="([^"]+)"/.exec(responseBody)?.[1];
  if (!status) {
    return err(new P1BusinessError(faultMessage(responseBody)));
  }

  return ok({
    success: status === EBRS_STATUS_SUCCESS,
    status,
    documents: parseDocuments(responseBody),
    raw: responseBody,
  });
}

/** Parsuje ExtrinsicObject (LeafClass) lub ObjectRef z odpowiedzi. */
function parseDocuments(xml: string): FoundDocument[] {
  const docs: FoundDocument[] = [];

  // LeafClass: pełne ExtrinsicObject.
  const extrinsicRe = /<(?:\w+:)?ExtrinsicObject\b([\s\S]*?)<\/(?:\w+:)?ExtrinsicObject>/g;
  let m: RegExpExecArray | null;
  while ((m = extrinsicRe.exec(xml)) !== null) {
    const block = m[0];
    const openTag = /<(?:\w+:)?ExtrinsicObject\b([^>]*)>/.exec(block)?.[1] ?? "";
    docs.push({
      ...textIf("entryUuid", /\bid="([^"]+)"/.exec(openTag)?.[1]),
      ...textIf("status", /\bstatus="([^"]+)"/.exec(openTag)?.[1]),
      ...textIf("uniqueId", externalId(block, XDS.DE_UNIQUE_ID_SCHEME)),
      ...textIf("repositoryUniqueId", slotValue(block, "repositoryUniqueId")),
      ...textIf("medicalEventId", slotValue(block, XDS.SLOT_MEDICAL_EVENT_ID)),
    });
  }
  if (docs.length > 0) return docs;

  // ObjectRef: same referencje.
  const refRe = /<(?:\w+:)?ObjectRef\b([^>]*)\/?>/g;
  while ((m = refRe.exec(xml)) !== null) {
    const id = /\bid="([^"]+)"/.exec(m[1] ?? "")?.[1];
    if (id) docs.push({ entryUuid: id });
  }
  return docs;
}

function slotValue(block: string, name: string): string | undefined {
  const re = new RegExp(
    `<(?:\\w+:)?Slot\\s+name="${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]*?<(?:\\w+:)?Value>([\\s\\S]*?)</(?:\\w+:)?Value>`,
  );
  return re.exec(block)?.[1]?.trim();
}

function externalId(block: string, scheme: string): string | undefined {
  const re = new RegExp(
    `<(?:\\w+:)?ExternalIdentifier\\b[^>]*identificationScheme="${scheme}"[^>]*\\bvalue="([^"]+)"`,
  );
  const re2 = new RegExp(
    `<(?:\\w+:)?ExternalIdentifier\\b[^>]*\\bvalue="([^"]+)"[^>]*identificationScheme="${scheme}"`,
  );
  return re.exec(block)?.[1] ?? re2.exec(block)?.[1];
}

function textIf(key: keyof FoundDocument, value: string | undefined): Partial<FoundDocument> {
  return value !== undefined ? { [key]: value } : {};
}

function faultMessage(xml: string): string {
  const reason =
    /<(?:\w+:)?(?:Text|faultstring|Reason)[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:Text|faultstring|Reason)>/.exec(
      xml,
    )?.[1];
  return reason ? `ITI-18: ${reason.trim()}` : "ITI-18: brak AdhocQueryResponse";
}
