import { randomUUID } from "node:crypto";
import {
  err,
  ok,
  type OperationOutcome,
  type P1Error,
  P1AuthorizationError,
  P1BusinessError,
  P1ServerError,
  P1TransportError,
  P1ValidationError,
  type Result,
} from "@p1/core";
import { PATIENT_SUMMARY_CONTEXT_AUDIENCE, PATIENT_SUMMARY_CONTEXT_ISSUER } from "./constants.js";
import type {
  OidRef,
  PatientSummaryContext,
  PatientSummaryDocument,
  PatientSummaryFormat,
  PatientSummaryTransport,
} from "./types.js";

/**
 * Pobiera dokument Patient Summary (Karta Pacjenta) w żądanym formacie
 * (`PDF`/`HL7_CDA`) operacją `GET /patient-summary/{format}`: token OAuth2 (Bearer)
 * + nagłówki kontekstu dostępu → odpowiedź JSON z dokumentem zakodowanym base64.
 */
export async function fetchPatientSummary(
  format: PatientSummaryFormat,
  context: PatientSummaryContext,
  transport: PatientSummaryTransport,
): Promise<Result<PatientSummaryDocument, P1Error>> {
  const url = `${trimTrailingSlash(transport.baseUrl)}/patient-summary/${format}`;
  const correlationId = transport.correlationId ?? randomUUID();

  let response;
  try {
    response = await transport.httpClient.send({
      url,
      method: "GET",
      headers: {
        Authorization: `Bearer ${transport.accessToken}`,
        Accept: "application/json",
        "Identyfikator-Pacjenta": oid(context.patient),
        "Kontekst-idPodmiotu": oid(context.subject),
        "Kontekst-idMiejscaUdzielaniaSwiadczen": oid(context.workplace),
        "Kontekst-idUzytkownika": oid(context.user),
        "Kontekst-rolaUzytkownika": context.userRole,
        "Kontekst-trybDostepuDoDanych": context.accessMode,
        "Kontekst-uuidZdarzeniaInicjujacego": correlationId,
        KontekstUzytkownika: buildUserContext(context, correlationId, transport),
      },
    });
  } catch (cause) {
    return err(new P1TransportError("Patient Summary request failed", { cause }));
  }

  if (response.status >= 400) {
    return err(httpError(response.status, response.body));
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(response.body) as Record<string, unknown>;
  } catch {
    return err(
      new P1ServerError(`Nieoczekiwana odpowiedź Patient Summary: ${response.body.slice(0, 200)}`),
    );
  }

  const base64 = asString(parsed["dokument"]);
  if (base64 === undefined) {
    return err(
      httpErrorFromWynik(response.status, parsed) ??
        new P1ServerError("Brak treści dokumentu w odpowiedzi"),
    );
  }
  const content = Buffer.from(base64, "base64");
  const documentId = asString(parsed["idDokumentu"]);
  const generatedAt = asString(parsed["dataWygenerowania"]);

  return ok({
    format,
    content,
    ...(format === "HL7_CDA" ? { cdaXml: content.toString("utf8") } : {}),
    ...(documentId !== undefined ? { documentId } : {}),
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  });
}

/** Buduje blob `KontekstUzytkownika` (base64 z JSON) wg wzorca P1. */
function buildUserContext(
  context: PatientSummaryContext,
  jti: string,
  transport: PatientSummaryTransport,
): string {
  const now = transport.clock?.now() ?? new Date();
  const exp = Math.floor(now.getTime() / 1000) + 300;
  const payload: Record<string, unknown> = {
    sub: oid(context.subject),
    child_organization: oid(context.workplace),
    user_role: context.userRole,
    user_id: oid(context.user),
    purpose: context.accessMode,
    aud: PATIENT_SUMMARY_CONTEXT_AUDIENCE,
    iss: PATIENT_SUMMARY_CONTEXT_ISSUER,
    exp,
    jti,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

/** Mapuje błędną odpowiedź HTTP na odpowiedni `P1Error` (z treścią `Wynik`, jeśli jest). */
function httpError(status: number, body: string): P1Error {
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    parsed = undefined;
  }
  return httpErrorFromWynik(status, parsed) ?? defaultHttpError(status, body.slice(0, 200));
}

function httpErrorFromWynik(status: number, parsed?: Record<string, unknown>): P1Error | undefined {
  if (!parsed) return undefined;
  const message = asString(parsed["komunikat"]);
  const major = asString(parsed["major"]);
  const minor = asString(parsed["minor"]);
  if (message === undefined && major === undefined) return undefined;
  const text = message ?? major ?? `HTTP ${status}`;
  const outcome: OperationOutcome = {
    major: major ?? `HTTP ${status}`,
    ...(minor !== undefined ? { minor } : {}),
    ...(message !== undefined ? { message } : {}),
  };
  if (status === 400) return new P1ValidationError(text);
  if (status === 403) return new P1AuthorizationError(text);
  if (status === 404) return new P1BusinessError(text, { outcome });
  return new P1ServerError(text);
}

function defaultHttpError(status: number, snippet: string): P1Error {
  const message = `Patient Summary HTTP ${status}: ${snippet}`;
  if (status === 400) return new P1ValidationError(message);
  if (status === 403) return new P1AuthorizationError(message);
  return new P1ServerError(message);
}

function oid(ref: OidRef): string {
  return `${ref.root}:${ref.extension}`;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
