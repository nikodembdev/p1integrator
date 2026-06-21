/**
 * Smoke-test e2e e-recepty: buduje receptę na lek naszą libką, podpisuje (XAdES
 * in-process), pakuje w pakiet recept (zapisPakietuRecept) + kopertę SOAP/WS-Security,
 * wysyła mTLS-em na P1 integrację i wypisuje SUROWĄ odpowiedź. Dane konta/pacjenta i
 * sekrety z env (`.local/p1.env`), certy z `.local/certs`. Wzór: `.env.example`.
 *
 * Uruchom: pnpm tsx scripts/smoke-erecepta.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HttpClient } from "../packages/core/src/index.js";
import {
  issueDrugPrescription,
  type PrescriptionTransport,
} from "../packages/prescription/src/index.js";
import { createXadesDocumentSigner } from "../packages/signing/src/index.js";
import { createNodeHttpClient, parseP12 } from "../packages/transport/src/index.js";
import {
  buildE2ePrescriptionInput,
  e2eContext,
  p1Account as a,
  p1AccountComplete,
} from "../test/integration/p1-account.js";

if (!p1AccountComplete) {
  console.error(
    "Brak kompletu danych konta - uzupełnij `.local/p1.env` (wzór: `.env.example`), w tym CERT_PASSWORD.",
  );
  process.exit(1);
}

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

const transport: PrescriptionTransport = {
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
  endpoint: a.receptaEndpoint,
};

async function main(): Promise<void> {
  const input = buildE2ePrescriptionInput();
  console.log("Wysyłam receptę na:", a.receptaEndpoint);
  console.log("Numer recepty:", input.prescriptionNumber);
  const result = await issueDrugPrescription(input, transport);
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
