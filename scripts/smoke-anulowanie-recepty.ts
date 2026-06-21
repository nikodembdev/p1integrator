/**
 * Smoke-test e2e anulowania recepty: najpierw wystawia receptę (zapisPakietuRecept),
 * pobiera `kluczRecepty`, a następnie anuluje ją (zapisDokumentuAnulowaniaRecepty).
 * Dane konta/sekrety z `.local/p1.env`, certy z `.local/certs`. Wzór: `.env.example`.
 *
 * Uruchom: pnpm tsx scripts/smoke-anulowanie-recepty.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HttpClient } from "../packages/core/src/index.js";
import {
  cancelDrugPrescription,
  issueDrugPrescription,
  type PrescriptionCancellationInput,
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
  console.error("Brak kompletu danych konta — uzupełnij `.local/p1.env`.");
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
    const response = await baseHttp.send(request);
    console.log(`← HTTP ${response.status}`);
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
  console.log("1) Wystawiam receptę nr", input.prescriptionNumber);
  const issued = await issueDrugPrescription(input, transport);
  if (!issued.ok) {
    console.log("BŁĄD wystawienia:", issued.error.kind, issued.error.message);
    return;
  }
  const kluczRecepty = issued.value.prescriptions[0]?.key;
  console.log(
    "   wystawiona, klucz recepty:",
    kluczRecepty,
    "| outcome:",
    issued.value.outcome?.major,
  );
  if (!kluczRecepty) {
    console.log("Brak kluczRecepty — nie mogę anulować.");
    return;
  }

  const cancellation: PrescriptionCancellationInput = {
    localRoot: input.localRoot,
    cancellationNumber: randomUUID().replace(/-/g, "").toUpperCase().slice(0, 22),
    cancelled: {
      prescriptionNumber: input.prescriptionNumber,
      versionSetId: input.versionSetId,
      title: "Recepta",
    },
    patient: input.patient,
    author: input.author,
    authorSpecialtyCode: "0713",
    authorSpecialtyName: "medycyna rodzinna",
    legalAuthenticator: input.legalAuthenticator,
    nfzBranch: input.payment.nfzBranch,
  };

  console.log("2) Anuluję receptę (klucz powyżej)…");
  const cancelled = await cancelDrugPrescription(cancellation, kluczRecepty, transport);
  console.log("\n=== WYNIK ANULOWANIA ===");
  if (cancelled.ok) {
    console.log("OK:", JSON.stringify(cancelled.value, null, 2));
  } else {
    console.log("BŁĄD:", cancelled.error.kind, "-", cancelled.error.message);
  }
}

main().catch((e: unknown) => {
  console.error("Wyjątek:", e);
  process.exit(1);
});
