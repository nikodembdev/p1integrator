import { createSign, randomUUID } from "node:crypto";
import {
  err,
  type HttpClient,
  ok,
  type P1Error,
  P1AuthenticationError,
  P1TransportError,
  type Result,
} from "@p1/core";

/**
 * Uwierzytelnianie do serwera FHIR ZM: OAuth2 client_credentials z podpisanym JWT
 * (private_key_jwt, RFC 7523 / OpenID Connect). Klient buduje i podpisuje assertion
 * kluczem z certyfikatu uwierzytelniającego P1, wymienia go w /token na access token.
 */

/** Stała wartość `aud` assertion (logiczny adres serwera autoryzacji, nie endpoint isus). */
export const ZM_TOKEN_AUDIENCE = "https://ezdrowie.gov.pl/token";
/** Zakres dostępu do serwera FHIR ZM. */
export const ZM_FHIR_SCOPE = "https://ezdrowie.gov.pl/fhir";

export interface AccessTokenRequest {
  /** Adres usługi tokenu (np. https://isus.ezdrowie.gov.pl/token). */
  readonly tokenEndpoint: string;
  /** Klucz prywatny z certyfikatu uwierzytelniającego (PEM). */
  readonly privateKeyPem: string;
  /** `iss` - identyfikator (OID) podmiotu lub aplikacji usługodawcy. */
  readonly issuer: string;
  /** `sub` - identyfikator (OID) podmiotu wywołującego usługi FHIR. */
  readonly subject: string;
  /** `user_id` - identyfikator użytkownika w formacie {root}:{extension}. */
  readonly userId: string;
  /** `user_role` - rola użytkownika (np. "LEK", "PIEL", "RAT", "ASYS"). */
  readonly userRole: string;
  /** `child_organization` - OID miejsca udzielania świadczeń (jednostka/komórka). */
  readonly childOrganization?: string;
  /** `purpose` - tryb dostępu: "CONTT" (kontynuacja) lub "BTG" (ratowanie życia); zwykle pomijany. */
  readonly purpose?: string;
  /** `con` - kontekst pracownika dla roli ASYS ({root}:{extension}). */
  readonly assistantContext?: string;
  /** `scope` (domyślnie serwer FHIR ZM). */
  readonly scope?: string;
  /** `aud` (domyślnie {@link ZM_TOKEN_AUDIENCE}). */
  readonly audience?: string;
  /** Ważność assertion w sekundach (domyślnie 300). */
  readonly ttlSeconds?: number;
  /** Czas bazowy - wstrzykiwalny dla testów. */
  readonly now?: Date;
  /** `jti` - wstrzykiwalny dla testów (domyślnie UUID). */
  readonly jti?: string;
}

export interface AccessToken {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly expiresIn?: number;
  /** Surowa odpowiedź serwera tokenu. */
  readonly raw: unknown;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Buduje podpisany JWT (client_assertion) zgodny ze specyfikacją ZM:
 * header `{alg: RS256, typ: JWT}`, claims iss/sub/aud/jti/exp/user_id, podpis RS256.
 */
export function buildClientAssertion(request: AccessTokenRequest): string {
  const now = request.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = issuedAt + (request.ttlSeconds ?? 300);

  const header = { alg: "RS256", typ: "JWT" };
  const payload: Record<string, unknown> = {
    iss: request.issuer,
    sub: request.subject,
    aud: request.audience ?? ZM_TOKEN_AUDIENCE,
    jti: request.jti ?? randomUUID(),
    iat: issuedAt,
    exp: expiresAt,
    user_id: request.userId,
    user_role: request.userRole,
  };
  if (request.childOrganization) payload["child_organization"] = request.childOrganization;
  if (request.purpose) payload["purpose"] = request.purpose;
  if (request.assistantContext) payload["con"] = request.assistantContext;

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).end().sign(request.privateKeyPem);
  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Wymienia podpisany JWT na token dostępu w usłudze /token (client_credentials).
 * Wymaga `HttpClient` (z mTLS), bo P1 wymaga TLS z certyfikatem klienta.
 */
export async function requestAccessToken(
  request: AccessTokenRequest,
  httpClient: HttpClient,
): Promise<Result<AccessToken, P1Error>> {
  const assertion = buildClientAssertion(request);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: assertion,
    scope: request.scope ?? ZM_FHIR_SCOPE,
  }).toString();

  let response;
  try {
    response = await httpClient.send({
      url: request.tokenEndpoint,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
  } catch (cause) {
    return err(new P1TransportError("Token request failed", { cause }));
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(response.body) as Record<string, unknown>;
  } catch {
    return err(
      new P1AuthenticationError(`Nieoczekiwana odpowiedź /token: ${response.body.slice(0, 200)}`),
    );
  }

  // P1 zwraca pola camelCase (`accessToken`) i obiekt `error` (null przy sukcesie).
  const accessToken = parsed["accessToken"] ?? parsed["access_token"];
  if (response.status >= 400 || typeof accessToken !== "string") {
    return err(
      new P1AuthenticationError(
        `Uwierzytelnienie ZM nieudane: ${tokenError(parsed, response.status)}`,
      ),
    );
  }

  return ok({
    accessToken,
    tokenType: asString(parsed["token_type"]) ?? "Bearer",
    ...(typeof parsed["expires_in"] === "number" ? { expiresIn: parsed["expires_in"] } : {}),
    raw: parsed,
  });
}

/** Buduje czytelny opis błędu z odpowiedzi /token (P1: obiekt `error` z diagnostics/location). */
function tokenError(parsed: Record<string, unknown>, status: number): string {
  const error = parsed["error"];
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const diagnostics = asString(e["diagnostics"]);
    const location = asString(e["location"]);
    if (diagnostics) return location ? `${diagnostics} (${location})` : diagnostics;
  }
  return asString(parsed["error_description"]) ?? asString(error) ?? `HTTP ${status}`;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
