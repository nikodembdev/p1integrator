import { createVerify, generateKeyPairSync } from "node:crypto";
import type { HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import {
  buildClientAssertion,
  requestAccessToken,
  ZM_FHIR_SCOPE,
  ZM_TOKEN_AUDIENCE,
} from "./oauth.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

const baseRequest = {
  tokenEndpoint: "https://p1.example/token",
  privateKeyPem,
  issuer: "2.16.840.1.113883.3.4424.2.3.1:000000927722",
  subject: "2.16.840.1.113883.3.4424.2.3.1:000000927722",
  userId: "2.16.840.1.113883.3.4424.1.6.2:4727124",
  userRole: "LEK",
  now: new Date("2026-01-01T00:00:00Z"),
  jti: "11111111-1111-1111-1111-111111111111",
};

function decode(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("buildClientAssertion", () => {
  const jwt = buildClientAssertion(baseRequest);
  const [headerB64, payloadB64, signatureB64] = jwt.split(".");

  it("buduje JWT z nagłówkiem RS256/JWT", () => {
    expect(decode(headerB64 ?? "")).toEqual({ alg: "RS256", typ: "JWT" });
  });

  it("ustawia wymagane claims (iss/sub/aud/jti/exp/user_id)", () => {
    const payload = decode(payloadB64 ?? "");
    expect(payload.iss).toBe(baseRequest.issuer);
    expect(payload.sub).toBe(baseRequest.subject);
    expect(payload.aud).toBe(ZM_TOKEN_AUDIENCE);
    expect(payload.jti).toBe(baseRequest.jti);
    expect(payload.user_id).toBe(baseRequest.userId);
    expect(payload.user_role).toBe("LEK");
    expect(payload.iat).toBe(1767225600);
    expect(payload.exp).toBe(1767225600 + 300);
  });

  it("podpisuje (RS256) tak, że podpis weryfikuje się kluczem publicznym", () => {
    const valid = createVerify("RSA-SHA256")
      .update(`${headerB64}.${payloadB64}`)
      .verify(publicKeyPem, Buffer.from(signatureB64 ?? "", "base64url"));
    expect(valid).toBe(true);
  });
});

describe("requestAccessToken", () => {
  const okClient = (capture?: (r: HttpRequest) => void): HttpClient => ({
    send: (request) => {
      capture?.(request);
      return Promise.resolve({
        status: 200,
        headers: {},
        body: JSON.stringify({ error: null, accessToken: "ACCESS-123" }),
      });
    },
  });

  it("wysyła poprawne żądanie i zwraca token", async () => {
    let captured: HttpRequest | undefined;
    const result = await requestAccessToken(
      baseRequest,
      okClient((r) => (captured = r)),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accessToken).toBe("ACCESS-123");
      expect(result.value.tokenType).toBe("Bearer");
    }

    expect(captured?.method).toBe("POST");
    expect(captured?.url).toBe("https://p1.example/token");
    expect(captured?.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(captured?.body).toContain("grant_type=client_credentials");
    expect(captured?.body).toContain(
      "client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer",
    );
    expect(captured?.body).toContain("client_assertion=");
    expect(captured?.body).toContain(`scope=${encodeURIComponent(ZM_FHIR_SCOPE)}`);
  });

  it("mapuje odpowiedź błędu na błąd uwierzytelnienia", async () => {
    const client: HttpClient = {
      send: () =>
        Promise.resolve({
          status: 422,
          headers: {},
          body: JSON.stringify({
            error: {
              severity: "error",
              diagnostics: "Błąd weryfikacji parametrów tokenu",
              location: "child_organization",
            },
            accessToken: null,
          }),
        }),
    };
    const result = await requestAccessToken(baseRequest, client);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("authentication");
      expect(result.error.message).toContain("child_organization");
    }
  });

  it("mapuje błąd sieci na błąd transportu", async () => {
    const client: HttpClient = { send: () => Promise.reject(new Error("ECONNREFUSED")) };
    const result = await requestAccessToken(baseRequest, client);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("transport");
  });
});
