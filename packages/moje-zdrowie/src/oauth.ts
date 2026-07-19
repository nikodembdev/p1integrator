import { err, ok, P1ValidationError, type Result } from "@p1/core";
import type { AccessTokenRequest } from "@p1/medical-events";
import { SGOA_FHIR_SCOPE } from "./constants.js";
import type { SgoaUserRole } from "./types.js";

/**
 * Uwierzytelnianie SGO-A = ten sam mechanizm co Zdarzenia Medyczne (OAuth2
 * client_credentials + private_key_jwt, RS256 kluczem z certyfikatu P1) - token
 * pobiera `requestAccessToken` z `@p1/medical-events`, różni się tylko `scope`
 * i zestawem ról. SGO-A nie używa `purpose` (trybu dostępu do danych).
 */

/** Parametry żądania tokenu SGO-A (podzbiór `AccessTokenRequest` bez `purpose`/`scope`). */
export interface SgoaTokenOptions {
  /** Adres usługi tokenu (np. `https://isus.ezdrowie.gov.pl/token`). */
  readonly tokenEndpoint: string;
  /** Klucz prywatny z certyfikatu uwierzytelniającego P1 (PEM). */
  readonly privateKeyPem: string;
  /** `sub` - OID usługodawcy w formacie `{root}:{extension}` (root `.2.3.1`/`.2.4*`/`.2.5*`). */
  readonly subject: string;
  /** `iss` - OID podmiotu z certyfikatu P1 (domyślnie = `subject`). */
  readonly issuer?: string;
  /** `user_id` - OID użytkownika `{root}:{extension}` (dla PROFILAKTYK root `.1.12.18`). */
  readonly userId: string;
  /** `user_role` - rola użytkownika SGO-A. */
  readonly userRole: SgoaUserRole;
  /** `child_organization` - OID miejsca udzielania świadczeń (komórka `.2.3.3`). */
  readonly childOrganization?: string;
  /** `con` - kontekst pracownika medycznego, OBOWIĄZKOWY przy roli `ASYS`. */
  readonly assistantContext?: string;
  /** Ważność assertion w sekundach (domyślnie 300). */
  readonly ttlSeconds?: number;
  /** Czas bazowy - wstrzykiwalny dla testów. */
  readonly now?: Date;
  /** `jti` - wstrzykiwalny dla testów. */
  readonly jti?: string;
}

/**
 * Buduje `AccessTokenRequest` dla SGO-A (scope `fhir-sgoa`, bez `purpose`).
 * Waliduje wymóg kontekstu pracownika (`con`) przy roli `ASYS`.
 * Wynik przekazuje się do `requestAccessToken` z `@p1/medical-events`.
 */
export function buildSgoaTokenRequest(
  options: SgoaTokenOptions,
): Result<AccessTokenRequest, P1ValidationError> {
  if (options.userRole === "ASYS" && !options.assistantContext) {
    return err(
      new P1ValidationError(
        "Rola ASYS wymaga kontekstu pracownika medycznego (assistantContext / claim `con`)",
      ),
    );
  }
  return ok({
    tokenEndpoint: options.tokenEndpoint,
    privateKeyPem: options.privateKeyPem,
    issuer: options.issuer ?? options.subject,
    subject: options.subject,
    userId: options.userId,
    userRole: options.userRole,
    scope: SGOA_FHIR_SCOPE,
    ...(options.childOrganization ? { childOrganization: options.childOrganization } : {}),
    ...(options.assistantContext ? { assistantContext: options.assistantContext } : {}),
    ...(options.ttlSeconds !== undefined ? { ttlSeconds: options.ttlSeconds } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
    ...(options.jti !== undefined ? { jti: options.jti } : {}),
  });
}
