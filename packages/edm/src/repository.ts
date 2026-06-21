import type { DocumentStore } from "./document-store.js";
import { XDSB_NS } from "./iti43.js";

/**
 * Toolkit repozytorium XDS.b - strona serwera. Repozytorium (przechowywanie treści)
 * stawia konsument; biblioteka daje handler protokołu ITI-43 wpinany we własny serwer
 * HTTP, działający na porcie `DocumentStore`. `handleRetrieveDocumentSet` parsuje
 * żądanie, pobiera treść ze store'a i buduje kopertę odpowiedzi (SOAP 1.2).
 */

const SOAP12_NS = "http://www.w3.org/2003/05/soap-envelope";
const RS_NS = "urn:oasis:names:tc:ebxml-regrep:xsd:rs:3.0";
const STATUS_SUCCESS = "urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Success";
const STATUS_PARTIAL = "urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:PartialSuccess";
const STATUS_FAILURE = "urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Failure";
const ERROR_SEVERITY = "urn:oasis:names:tc:ebxml-regrep:ErrorSeverityType:Error";
const ACTION_RESPONSE = "urn:ihe:iti:2007:RetrieveDocumentSetResponse";
const WSA_NS = "http://www.w3.org/2005/08/addressing";

export interface RetrieveHandlerResult {
  /** Pełna koperta SOAP 1.2 odpowiedzi (do zwrócenia przez serwer HTTP). */
  readonly soap: string;
  /** Status ebRS (Success/PartialSuccess/Failure). */
  readonly status: string;
  /** Liczba zwróconych dokumentów. */
  readonly returned: number;
  /** Identyfikatory dokumentów, których nie znaleziono. */
  readonly missing: readonly string[];
}

const escapeXml = (v: string): string =>
  v.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);

function el(block: string, name: string): string | undefined {
  return new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(block)?.[1]?.trim();
}

/** Parsuje DocumentRequest z żądania ITI-43. */
export function parseRetrieveRequest(
  requestXml: string,
): { repositoryUniqueId: string; documentUniqueId: string; homeCommunityId?: string }[] {
  const out: { repositoryUniqueId: string; documentUniqueId: string; homeCommunityId?: string }[] =
    [];
  const re = /<(?:\w+:)?DocumentRequest\b[\s\S]*?<\/(?:\w+:)?DocumentRequest>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(requestXml)) !== null) {
    const block = m[0];
    const repositoryUniqueId = el(block, "RepositoryUniqueId");
    const documentUniqueId = el(block, "DocumentUniqueId");
    const homeCommunityId = el(block, "HomeCommunityId");
    if (repositoryUniqueId && documentUniqueId) {
      out.push({
        repositoryUniqueId,
        documentUniqueId,
        ...(homeCommunityId ? { homeCommunityId } : {}),
      });
    }
  }
  return out;
}

/**
 * Obsługuje żądanie ITI-43 (Retrieve Document Set) po stronie repozytorium:
 * pobiera treść z `DocumentStore` i buduje kopertę odpowiedzi. Konsument wywołuje
 * to w handlerze swojego serwera HTTP (Express/Fastify/...) i zwraca `soap` z
 * nagłówkiem `Content-Type: application/soap+xml`.
 */
export async function handleRetrieveDocumentSet(
  requestXml: string,
  store: DocumentStore,
): Promise<RetrieveHandlerResult> {
  const requests = parseRetrieveRequest(requestXml);
  const responses: string[] = [];
  const missing: string[] = [];

  for (const req of requests) {
    const doc = await store.get({
      repositoryUniqueId: req.repositoryUniqueId,
      documentUniqueId: req.documentUniqueId,
    });
    if (!doc) {
      missing.push(req.documentUniqueId);
      continue;
    }
    responses.push(
      `<xdsb:DocumentResponse>` +
        (req.homeCommunityId
          ? `<xdsb:HomeCommunityId>${escapeXml(req.homeCommunityId)}</xdsb:HomeCommunityId>`
          : "") +
        `<xdsb:RepositoryUniqueId>${escapeXml(req.repositoryUniqueId)}</xdsb:RepositoryUniqueId>` +
        `<xdsb:DocumentUniqueId>${escapeXml(req.documentUniqueId)}</xdsb:DocumentUniqueId>` +
        `<xdsb:mimeType>${escapeXml(doc.mimeType)}</xdsb:mimeType>` +
        `<xdsb:Document>${doc.content.toString("base64")}</xdsb:Document>` +
        `</xdsb:DocumentResponse>`,
    );
  }

  const status =
    missing.length === 0
      ? STATUS_SUCCESS
      : responses.length === 0
        ? STATUS_FAILURE
        : STATUS_PARTIAL;

  const errorList =
    missing.length > 0
      ? `<rs:RegistryErrorList>` +
        missing
          .map(
            (id) =>
              `<rs:RegistryError errorCode="XDSDocumentUniqueIdError" severity="${ERROR_SEVERITY}"` +
              ` codeContext="Nie znaleziono dokumentu" location="${escapeXml(id)}"/>`,
          )
          .join("") +
        `</rs:RegistryErrorList>`
      : "";

  const soap =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${SOAP12_NS}" xmlns:xdsb="${XDSB_NS}" xmlns:rs="${RS_NS}">` +
    `<soapenv:Header><wsa:Action xmlns:wsa="${WSA_NS}">${ACTION_RESPONSE}</wsa:Action></soapenv:Header>` +
    `<soapenv:Body>` +
    `<xdsb:RetrieveDocumentSetResponse>` +
    `<rs:RegistryResponse status="${status}">${errorList}</rs:RegistryResponse>` +
    responses.join("") +
    `</xdsb:RetrieveDocumentSetResponse>` +
    `</soapenv:Body></soapenv:Envelope>`;

  return { soap, status, returned: responses.length, missing };
}
