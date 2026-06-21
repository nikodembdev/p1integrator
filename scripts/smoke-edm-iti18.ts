/**
 * Smoke EDM Faza 3: token SAML -> wyszukanie indeksów EDM pacjenta (ITI-18 FindDocuments).
 * Uruchom: pnpm tsx scripts/smoke-edm-iti18.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CallContext } from "../packages/core/src/index.js";
import { findDocuments, requestSamlToken } from "../packages/edm/src/index.js";
import { createNodeHttpClient, parseP12 } from "../packages/transport/src/index.js";
import { p1Account as a, p1AccountComplete } from "../test/integration/p1-account.js";

if (!p1AccountComplete) {
  console.error("Brak kompletu danych konta - uzupełnij `.local/p1.env`.");
  process.exit(1);
}

const tokenEndpoint =
  process.env.P1_EDM_TOKEN_ENDPOINT ??
  "https://isus.ezdrowie.gov.pl/services/ObslugaGenerowanieTokenuSamlWS";
const iti18Endpoint =
  process.env.P1_EDM_ITI18_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/services/ObslugaEdmIti18WS";

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

const PESEL_OID = "2.16.840.1.113883.3.4424.1.1.616";
const patientCx = `${a.patient.pesel}^^^&${PESEL_OID}&ISO`;

const context: CallContext = {
  subject: { root: a.providerRoot, extension: a.podmiotExt },
  user: { root: a.userRoot, extension: a.npwz },
  workplace: { root: a.musRoot, extension: `${a.podmiotExt}-${a.musExt}` },
  businessRole: "DOCTOR",
};

async function main(): Promise<void> {
  const token = await requestSamlToken(
    {
      endpoint: tokenEndpoint,
      context,
      wsSecurityCertificate: wss,
      patient: { root: PESEL_OID, extension: a.patient.pesel },
    },
    httpClient,
  );
  if (!token.ok) {
    console.log("BŁĄD tokenu SAML:", token.error.message);
    return;
  }
  console.log("Token SAML OK:", token.value.assertionId);

  const result = await findDocuments(
    {
      endpoint: iti18Endpoint,
      assertionXml: token.value.assertionXml,
      wsSecurityCertificate: wss,
      patientId: patientCx,
      returnType: "ObjectRef",
    },
    httpClient,
  );

  console.log("\n=== WYNIK ITI-18 ===");
  if (!result.ok) {
    console.log("BŁĄD:", result.error.kind, "-", result.error.message);
    return;
  }
  console.log("status:", result.value.status, "| znaleziono:", result.value.documents.length);
  for (const d of result.value.documents.slice(0, 5)) {
    console.log(
      `  - uniqueId=${d.uniqueId ?? "?"} repo=${d.repositoryUniqueId ?? "?"} zdarzenie=${d.medicalEventId ?? "?"}`,
    );
  }
  if (!result.value.success) {
    const errs = result.value.raw.match(/<[^>]*RegistryError\b[^>]*>/g) ?? [];
    for (const e of errs.slice(0, 3))
      console.log("  ERR:", e.replace(/></g, ">\n      <").slice(0, 400));
  }
}

main().catch((e: unknown) => {
  console.error("Wyjątek:", e);
  process.exit(1);
});
