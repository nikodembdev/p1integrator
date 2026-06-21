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
import { buildSubmissionSet, type SubmissionSetInput, XDS } from "./ebrim.js";
import { buildSignedEdmEnvelope, EBRS_STATUS_SUCCESS, soap12ContentType } from "./soap-edm.js";

/**
 * ITI-57 (Update Document Set) - aktualizacja indeksu EDM w rejestrze P1.
 * Tu zmiana statusu dostępności indeksu (Approved <-> Deprecated), czyli m.in.
 * "anulowanie" indeksu (Deprecated). Realizowana asocjacją UpdateAvailabilityStatus
 * (source = nowy SubmissionSet, target = UUID istniejącego indeksu z ITI-18).
 * SOAP 1.2 + asercja SAML + podpis (jak ITI-42).
 */

const RIM_NS = "urn:oasis:names:tc:ebxml-regrep:xsd:rim:3.0";
const LCM_NS = "urn:oasis:names:tc:ebxml-regrep:xsd:lcm:3.0";
const ACTION = "urn:ihe:iti:2010:UpdateDocumentSet";
const UPDATE_STATUS_ASSOCIATION = "urn:ihe:iti:2010:AssociationType:UpdateAvailabilityStatus";
const STATUS = {
  Approved: "urn:oasis:names:tc:ebxml-regrep:StatusType:Approved",
  Deprecated: "urn:oasis:names:tc:ebxml-regrep:StatusType:Deprecated",
} as const;

/** Domyślny endpoint ITI-57 (środowisko integracyjne). */
export const DEFAULT_ITI57_ENDPOINT = "https://isus.ezdrowie.gov.pl/services/ObslugaEdmIti57WS";

export type IndexStatus = "Approved" | "Deprecated";

export interface UpdateDocumentStatusInput {
  readonly endpoint?: string;
  readonly assertionXml: string;
  readonly wsSecurityCertificate: WsSecurityCertificate;
  /** Nowa wysyłka opisująca aktualizację (autor, uniqueId, pacjent...). */
  readonly submissionSet: SubmissionSetInput;
  /** UUID istniejącego indeksu w rejestrze (z ITI-18) - cel aktualizacji. */
  readonly targetEntryUuid: string;
  /** Status przed zmianą (domyślnie Approved). */
  readonly originalStatus?: IndexStatus;
  /** Status docelowy (domyślnie Deprecated - "anulowanie" indeksu). */
  readonly newStatus?: IndexStatus;
  /** Symboliczny id asocjacji aktualizującej. */
  readonly associationId?: string;
  readonly now?: Date;
  readonly ttlSeconds?: number;
  readonly idSuffix?: string;
  readonly messageId?: string;
}

export interface UpdateDocumentStatusResult {
  readonly success: boolean;
  readonly status?: string;
  readonly errors: readonly { errorCode?: string; codeContext?: string; severity?: string }[];
  readonly raw: string;
}

/** Buduje podpisaną kopertę ITI-57 zmiany statusu indeksu. */
export function buildUpdateDocumentStatusRequest(input: UpdateDocumentStatusInput): string {
  const associationId = input.associationId ?? `${input.submissionSet.submissionUuid}-status`;
  const original = STATUS[input.originalStatus ?? "Approved"];
  const next = STATUS[input.newStatus ?? "Deprecated"];

  const association =
    `<rim:Association xmlns:rim="${RIM_NS}" associationType="${UPDATE_STATUS_ASSOCIATION}"` +
    ` id="${associationId}" sourceObject="${input.submissionSet.submissionUuid}"` +
    ` targetObject="${input.targetEntryUuid}"` +
    ` objectType="${XDS.OBJECT_TYPE_ASSOCIATION}">` +
    `<rim:Slot name="OriginalStatus"><rim:ValueList><rim:Value>${original}</rim:Value></rim:ValueList></rim:Slot>` +
    `<rim:Slot name="NewStatus"><rim:ValueList><rim:Value>${next}</rim:Value></rim:ValueList></rim:Slot>` +
    `</rim:Association>`;

  const bodyXml =
    `<lcm:SubmitObjectsRequest><rim:RegistryObjectList xmlns:rim="${RIM_NS}">` +
    buildSubmissionSet(input.submissionSet) +
    association +
    `</rim:RegistryObjectList></lcm:SubmitObjectsRequest>`;

  return buildSignedEdmEnvelope({
    action: ACTION,
    endpoint: input.endpoint ?? DEFAULT_ITI57_ENDPOINT,
    bodyXml,
    assertionXml: input.assertionXml,
    certificate: input.wsSecurityCertificate,
    namespaces: { lcm: LCM_NS },
    ...(input.now !== undefined ? { now: input.now } : {}),
    ...(input.ttlSeconds !== undefined ? { ttlSeconds: input.ttlSeconds } : {}),
    ...(input.idSuffix !== undefined ? { idSuffix: input.idSuffix } : {}),
    ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
  });
}

/**
 * Aktualizuje status indeksu (ITI-57) - domyślnie Deprecated ("anulowanie" indeksu).
 * `targetEntryUuid` pobierz wcześniej z ITI-18.
 */
export async function updateDocumentStatus(
  input: UpdateDocumentStatusInput,
  httpClient: HttpClient,
): Promise<Result<UpdateDocumentStatusResult, P1Error>> {
  const endpoint = input.endpoint ?? DEFAULT_ITI57_ENDPOINT;
  const body = buildUpdateDocumentStatusRequest(input);

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
    return err(new P1TransportError("ITI-57 UpdateDocumentSet request failed", { cause }));
  }

  const status = /<(?:\w+:)?RegistryResponse\b[^>]*\bstatus="([^"]+)"/.exec(responseBody)?.[1];
  if (!status) {
    return err(new P1BusinessError(faultMessage(responseBody)));
  }
  return ok({
    success: status === EBRS_STATUS_SUCCESS,
    status,
    errors: parseErrors(responseBody),
    raw: responseBody,
  });
}

function parseErrors(
  xml: string,
): { errorCode?: string; codeContext?: string; severity?: string }[] {
  const out: { errorCode?: string; codeContext?: string; severity?: string }[] = [];
  const re = /<(?:\w+:)?RegistryError\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1] ?? "";
    const get = (n: string): string | undefined => new RegExp(`\\b${n}="([^"]*)"`).exec(attrs)?.[1];
    out.push({
      ...attr("errorCode", get("errorCode")),
      ...attr("codeContext", get("codeContext")),
      ...attr("severity", get("severity")),
    });
  }
  return out;
}

function attr(key: "errorCode" | "codeContext" | "severity", v: string | undefined) {
  return v !== undefined ? { [key]: v } : {};
}

function faultMessage(xml: string): string {
  const reason =
    /<(?:\w+:)?(?:Text|faultstring|Reason)[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:Text|faultstring|Reason)>/.exec(
      xml,
    )?.[1];
  return reason ? `ITI-57: ${reason.trim()}` : "ITI-57: brak RegistryResponse";
}
