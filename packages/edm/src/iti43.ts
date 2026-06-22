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
import { buildSignedEdmEnvelope, EBRS_STATUS_SUCCESS, soap12ContentType } from "./soap-edm.js";

/**
 * ITI-43 (Retrieve Document Set) - pobranie treści dokumentu z repozytorium XDS.b.
 * Klient: buduje RetrieveDocumentSetRequest (SOAP 1.2 + asercja SAML + podpis),
 * parsuje RetrieveDocumentSetResponse (Document jako base64). Repozytorium udostępnia
 * konsument (patrz toolkit `repository.ts`).
 */

export const XDSB_NS = "urn:ihe:iti:xds-b:2007";
const ACTION = "urn:ihe:iti:2007:RetrieveDocumentSet";

/** Domyślny endpoint ITI-43 repozytorium centralnego P1 (tylko INT). */
export const DEFAULT_ITI43_ENDPOINT =
  "https://irmdsus.ezdrowie.gov.pl/services/ObslugaRedDzIti43WS";

/** Wskazanie dokumentu do pobrania. */
export interface DocumentRequestRef {
  readonly repositoryUniqueId: string;
  readonly documentUniqueId: string;
  /** Identyfikator domeny XDS (homeCommunityId), opcjonalnie. */
  readonly homeCommunityId?: string;
}

export interface RetrieveDocumentSetInput {
  readonly endpoint?: string;
  readonly assertionXml: string;
  readonly wsSecurityCertificate: WsSecurityCertificate;
  readonly documents: readonly DocumentRequestRef[];
  readonly now?: Date;
  readonly ttlSeconds?: number;
  readonly idSuffix?: string;
  readonly messageId?: string;
}

export interface RetrievedDocument {
  readonly repositoryUniqueId?: string;
  readonly documentUniqueId?: string;
  readonly mimeType?: string;
  /** Treść dokumentu (odkodowana z base64). */
  readonly content: Buffer;
}

export interface RetrieveDocumentSetResult {
  readonly success: boolean;
  readonly status?: string;
  readonly documents: readonly RetrievedDocument[];
  readonly raw: string;
}

const escapeXml = (v: string): string =>
  v.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);

/** Buduje element body RetrieveDocumentSetRequest (xdsb). */
export function buildRetrieveDocumentSetBody(documents: readonly DocumentRequestRef[]): string {
  const reqs = documents
    .map(
      (d) =>
        `<xdsb:DocumentRequest>` +
        (d.homeCommunityId
          ? `<xdsb:HomeCommunityId>${escapeXml(d.homeCommunityId)}</xdsb:HomeCommunityId>`
          : "") +
        `<xdsb:RepositoryUniqueId>${escapeXml(d.repositoryUniqueId)}</xdsb:RepositoryUniqueId>` +
        `<xdsb:DocumentUniqueId>${escapeXml(d.documentUniqueId)}</xdsb:DocumentUniqueId>` +
        `</xdsb:DocumentRequest>`,
    )
    .join("");
  return `<xdsb:RetrieveDocumentSetRequest xmlns:xdsb="${XDSB_NS}">${reqs}</xdsb:RetrieveDocumentSetRequest>`;
}

/** Buduje podpisaną kopertę ITI-43. */
export function buildRetrieveDocumentSetRequest(input: RetrieveDocumentSetInput): string {
  return buildSignedEdmEnvelope({
    action: ACTION,
    endpoint: input.endpoint ?? DEFAULT_ITI43_ENDPOINT,
    bodyXml: buildRetrieveDocumentSetBody(input.documents),
    assertionXml: input.assertionXml,
    certificate: input.wsSecurityCertificate,
    ...(input.now !== undefined ? { now: input.now } : {}),
    ...(input.ttlSeconds !== undefined ? { ttlSeconds: input.ttlSeconds } : {}),
    ...(input.idSuffix !== undefined ? { idSuffix: input.idSuffix } : {}),
    ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
  });
}

/** Pobiera treść dokumentów z repozytorium (ITI-43) nad mTLS. */
export async function retrieveDocumentSet(
  input: RetrieveDocumentSetInput,
  httpClient: HttpClient,
): Promise<Result<RetrieveDocumentSetResult, P1Error>> {
  const endpoint = input.endpoint ?? DEFAULT_ITI43_ENDPOINT;
  const body = buildRetrieveDocumentSetRequest(input);

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
    return err(new P1TransportError("ITI-43 RetrieveDocumentSet request failed", { cause }));
  }

  const status = /<(?:\w+:)?RegistryResponse\b[^>]*\bstatus="([^"]+)"/.exec(responseBody)?.[1];
  if (!status) {
    return err(new P1BusinessError(faultMessage(responseBody)));
  }

  return ok({
    success: status === EBRS_STATUS_SUCCESS,
    status,
    documents: parseDocumentResponses(responseBody),
    raw: responseBody,
  });
}

/** Parsuje DocumentResponse z odpowiedzi (Document jako base64 inline). */
export function parseDocumentResponses(xml: string): RetrievedDocument[] {
  const out: RetrievedDocument[] = [];
  const re = /<(?:\w+:)?DocumentResponse\b[\s\S]*?<\/(?:\w+:)?DocumentResponse>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[0];
    const base64 = el(block, "Document") ?? "";
    out.push({
      ...textIf("repositoryUniqueId", el(block, "RepositoryUniqueId")),
      ...textIf("documentUniqueId", el(block, "DocumentUniqueId")),
      ...textIf("mimeType", el(block, "mimeType")),
      content: Buffer.from(base64.replace(/\s/g, ""), "base64"),
    });
  }
  return out;
}

function el(block: string, name: string): string | undefined {
  return new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(block)?.[1]?.trim();
}

function textIf(
  key: "repositoryUniqueId" | "documentUniqueId" | "mimeType",
  v: string | undefined,
) {
  return v !== undefined ? { [key]: v } : {};
}

function faultMessage(xml: string): string {
  const reason =
    /<(?:\w+:)?(?:Text|faultstring|Reason)[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:Text|faultstring|Reason)>/.exec(
      xml,
    )?.[1];
  return reason ? `ITI-43: ${reason.trim()}` : "ITI-43: brak RetrieveDocumentSetResponse";
}
