/**
 * Smoke-test e2e: buduje skierowanie ogólne naszą libką, podpisuje (XAdES przez
 * lokalny serwis), pakuje w kopertę SOAP+WS-Security, wysyła mTLS-em na P1 integrację
 * i wypisuje SUROWĄ odpowiedź. Dane konta/pacjenta i sekrety z env (`.local/p1.env`),
 * certy z `.local/certs` — nic z tego nie ma w repo. Wzór: `.env.example`.
 *
 * Uruchom: pnpm tsx scripts/smoke-eskierowanie.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HttpClient } from "../packages/core/src/index.js";
import { issueGeneralReferral, type ReferralTransport } from "../packages/referral/src/index.js";
import { createXadesDocumentSigner } from "../packages/signing/src/index.js";
import { createNodeHttpClient, parseP12 } from "../packages/transport/src/index.js";
import {
  buildE2eGeneralInput,
  e2eContext,
  p1Account as a,
  p1AccountComplete,
} from "../test/integration/p1-account.js";

if (!p1AccountComplete) {
  console.error(
    "Brak kompletu danych konta — uzupełnij `.local/p1.env` (wzór: `.env.example`), w tym CERT_PASSWORD.",
  );
  process.exit(1);
}

// Node odrzuca stary szyfr PKCS12 P1 → klucz/cert TLS jako PEM (node-forge).
const tls = parseP12(
  readFileSync(resolve(a.certDir, "Podmiot_leczniczy_713-tls.p12")),
  a.certPassword,
);
const baseHttp = createNodeHttpClient({
  tls: {
    key: tls.privateKeyPem,
    cert: tls.certificatePem,
    rejectUnauthorized: a.rejectUnauthorized,
  },
});
const httpClient: HttpClient = {
  async send(request) {
    console.log(`\n→ POST ${request.url}`);
    const response = await baseHttp.send(request);
    console.log(`← HTTP ${response.status}`);
    console.log("─── surowa odpowiedź P1 ───\n" + response.body + "\n───────────────────────────");
    return response;
  },
};

const transport: ReferralTransport = {
  context: e2eContext,
  documentSigner: createXadesDocumentSigner({
    certificate: {
      p12: readFileSync(resolve(a.certDir, "Adam713 Leczniczy.p12")),
      password: a.certPassword,
    },
  }),
  httpClient,
  wsSecurityCertificate: parseP12(
    readFileSync(resolve(a.certDir, "Podmiot_leczniczy_713-wss.p12")),
    a.certPassword,
  ),
  endpoint: a.endpoint,
};

async function main(): Promise<void> {
  console.log("Wysyłam skierowanie ogólne na:", a.endpoint);
  const result = await issueGeneralReferral(buildE2eGeneralInput(), transport);
  console.log("\n=== WYNIK ===");
  if (result.ok) {
    console.log("OK:", JSON.stringify(result.value, null, 2));
  } else {
    console.log("BŁĄD:", result.error.kind, "-", result.error.message);
  }
}

main().catch((e: unknown) => {
  console.error("Wyjątek:", e);
  process.exit(1);
});
