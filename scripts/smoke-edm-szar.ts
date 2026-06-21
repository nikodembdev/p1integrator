/**
 * Smoke EDM: rejestracja repozytorium (SZAR rejestrujRepozytorium) + danych dostępowych.
 * Uruchom: pnpm tsx scripts/smoke-edm-szar.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { registerAccessData, registerRepository } from "../packages/edm/src/index.js";
import { createNodeHttpClient, parseP12 } from "../packages/transport/src/index.js";
import { p1Account as a, p1AccountComplete } from "../test/integration/p1-account.js";

if (!p1AccountComplete) {
  console.error("Brak kompletu danych konta - uzupełnij `.local/p1.env`.");
  process.exit(1);
}

const endpoint =
  process.env.P1_EDM_SZAR_ENDPOINT ??
  "https://isus.ezdrowie.gov.pl/services/ObslugaRejestrowanieDanychDostepowychWS";

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

async function main(): Promise<void> {
  const repo = await registerRepository({ endpoint, wsSecurityCertificate: wss }, httpClient);
  console.log("=== rejestrujRepozytorium ===");
  if (!repo.ok) {
    console.log("BŁĄD:", repo.error.kind, "-", repo.error.message);
    return;
  }
  console.log(
    "status:",
    repo.value.status,
    "| repo:",
    repo.value.repositoryUniqueId,
    repo.value.description ?? "",
  );
  if (!repo.value.repositoryUniqueId) return;

  const access = await registerAccessData(
    {
      endpoint,
      wsSecurityCertificate: wss,
      repositoryUniqueId: repo.value.repositoryUniqueId,
      serviceAddress: "https://repo.example.test/services/ObslugaRedDzIti43WS",
    },
    httpClient,
  );
  console.log("\n=== rejestrujDaneDostepowe ===");
  if (!access.ok) {
    console.log("BŁĄD:", access.error.kind, "-", access.error.message);
    return;
  }
  console.log("status:", access.value.status, access.value.description ?? "");
}

main().catch((e: unknown) => {
  console.error("Wyjątek:", e);
  process.exit(1);
});
