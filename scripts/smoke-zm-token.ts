/**
 * Smoke ZM Faza 1: pobiera token dostępu OAuth2 z usługi /token (podpisany JWT
 * kluczem certyfikatu uwierzytelniającego, mTLS). Dane konta z `.local/p1.env`,
 * certy z `.local/certs`.
 *
 * Uruchom: pnpm tsx scripts/smoke-zm-token.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { requestAccessToken } from "../packages/medical-events/src/index.js";
import { createNodeHttpClient, parseP12 } from "../packages/transport/src/index.js";
import { p1Account as a, p1AccountComplete } from "../test/integration/p1-account.js";

if (!p1AccountComplete) {
  console.error("Brak kompletu danych konta - uzupełnij `.local/p1.env`.");
  process.exit(1);
}

const tokenEndpoint = process.env.P1_ZM_TOKEN_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/token";

// Podpis JWT: klucz z certyfikatu uwierzytelniającego (WS-Security).
const wss = parseP12(
  readFileSync(resolve(a.certDir, "Podmiot_leczniczy_713-wss.p12")),
  a.certPassword,
);
// mTLS na /token: certyfikat TLS.
const tls = parseP12(
  readFileSync(resolve(a.certDir, "Podmiot_leczniczy_713-tls.p12")),
  a.certPassword,
);
const httpClient = createNodeHttpClient({
  tls: {
    key: tls.privateKeyPem,
    cert: tls.certificatePem,
    rejectUnauthorized: a.rejectUnauthorized,
  },
});

async function main(): Promise<void> {
  const iss = `${a.providerRoot}:${a.podmiotExt}`;
  const userId = `${a.userRoot}:${a.npwz}`;
  // MUŚ (komórka): OID .2.3.3 + identyfikator {podmiot}-{res7}, np. 000000927722-001
  const childOrganization = `${a.musRoot}:${a.podmiotExt}-${a.musExt}`;
  console.log(
    "POST",
    tokenEndpoint,
    "\n  iss/sub:",
    iss,
    "\n  user_id:",
    userId,
    "\n  child_organization:",
    childOrganization,
  );

  const result = await requestAccessToken(
    {
      tokenEndpoint,
      privateKeyPem: wss.privateKeyPem,
      issuer: iss,
      subject: iss,
      userId,
      userRole: "LEK",
      childOrganization,
    },
    httpClient,
  );

  console.log("\n=== WYNIK ===");
  if (result.ok) {
    const t = result.value;
    console.log("OK token_type:", t.tokenType, "| expires_in:", t.expiresIn);
    console.log("access_token (skrót):", t.accessToken.slice(0, 40) + "...");
  } else {
    console.log("BŁĄD:", result.error.kind, "-", result.error.message);
  }
}

main().catch((e: unknown) => {
  console.error("Wyjątek:", e);
  process.exit(1);
});
