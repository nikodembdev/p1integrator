import { type DocumentSigner, P1ServerError, P1TransportError } from "@p1/core";

export interface SigningCertificate {
  /** Kontener PKCS#12 (.p12/.pfx) wysyłany do serwisu podpisu. */
  readonly p12: Buffer;
  readonly password: string;
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: { method: string; body: FormData; signal: AbortSignal },
) => Promise<FetchResponseLike>;

export interface DssDocumentSignerOptions {
  /** Endpoint serwisu Java/DSS (np. https://.../api/v1/sign). */
  readonly endpoint: string;
  /** Certyfikat podpisujący (PKCS#12) przekazywany do serwisu. */
  readonly certificate: SigningCertificate;
  /** Timeout żądania w ms (domyślnie 60000). */
  readonly timeoutMs?: number;
  /** Wstrzykiwalny `fetch` — do testów. Domyślnie globalny `fetch`. */
  readonly fetch?: FetchLike;
}

/**
 * `DocumentSigner` oparty o zewnętrzny serwis Java/DSS (XAdES-BES).
 * Wysyła dokument + certyfikat .p12 + hasło jako multipart/form-data i zwraca
 * podpisany XML.
 *
 * Pure-JS XAdES (np. `@peculiar/xades`) można dołożyć później jako alternatywny
 * adapter tego samego portu — po walidacji na środowisku integracja P1.
 */
export function createDssDocumentSigner(options: DssDocumentSignerOptions): DocumentSigner {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const fetchImpl: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));

  return {
    async signXades(documentXml: string): Promise<string> {
      const form = new FormData();
      form.append("document", new Blob([documentXml], { type: "application/xml" }), "document.xml");
      form.append(
        "certificate",
        new Blob([options.certificate.p12], { type: "application/x-pkcs12" }),
        "certificate.p12",
      );
      form.append("keystorePassword", options.certificate.password);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: FetchResponseLike;
      try {
        response = await fetchImpl(options.endpoint, {
          method: "POST",
          body: form,
          signal: controller.signal,
        });
      } catch (cause) {
        const reason = controller.signal.aborted
          ? `timed out after ${timeoutMs}ms`
          : cause instanceof Error
            ? cause.message
            : "network error";
        throw new P1TransportError(`XAdES signing request failed: ${reason}`, { cause });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new P1ServerError(
          `XAdES signing failed (HTTP ${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`,
        );
      }

      return response.text();
    },
  };
}
