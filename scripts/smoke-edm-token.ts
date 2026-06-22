/**
 * Smoke EDM Faza 1: pobranie tokenu SAML (generujToken, WS-Trust RST/Issue).
 * Uruchom: pnpm tsx scripts/smoke-edm-token.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { requestSamlToken } from "../packages/edm/src/index.js";
import { createNodeHttpClient, parseP12 } from "../packages/transport/src/index.js";
import type { CallContext } from "../packages/core/src/index.js";
import { p1Account as a, p1AccountComplete } from "../test/integration/p1-account.js";

if (!p1AccountComplete) {
  console.error("Brak kompletu danych konta - uzupełnij `.local/p1.env`.");
  process.exit(1);
}

const endpoint =
  process.env.P1_EDM_TOKEN_ENDPOINT ??
  "https://isus.ezdrowie.gov.pl/services/ObslugaGenerowanieTokenuSamlWS";

const wss = parseP12(
  readFileSync(resolve(a.certDir, "Podmiot_leczniczy_713-wss.p12")),
  a.certPassword,
);
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

// W EDM miejsce udzielania świadczeń (komórka .2.3.3) ma extension `{podmiot}-{mus}`.
const context: CallContext = {
  subject: { root: a.providerRoot, extension: a.podmiotExt },
  user: { root: a.userRoot, extension: a.npwz },
  workplace: { root: a.musRoot, extension: `${a.podmiotExt}-${a.musExt}` },
  businessRole: "DOCTOR",
};

async function main(): Promise<void> {
  const result = await requestSamlToken(
    { endpoint, context, wsSecurityCertificate: wss },
    httpClient,
  );

  console.log("=== WYNIK (token SAML) ===");
  if (result.ok) {
    console.log("OK asercja:", result.value.assertionId, "| ważna do:", result.value.notOnOrAfter);
    console.log("długość asercji:", result.value.assertionXml.length, "znaków");
  } else {
    console.log("BŁĄD:", result.error.kind, "-", result.error.message);
    const m = /<(\w+:)?Body[\s\S]*?<\/(\w+:)?Body>/.exec(result.error.message);
    if (m) console.log(m[0].slice(0, 1500));
  }
}

main().catch((e: unknown) => {
  console.error("Wyjątek:", e);
  process.exit(1);
});
