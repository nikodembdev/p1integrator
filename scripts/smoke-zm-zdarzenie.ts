/**
 * Smoke ZM Faza 2: token -> budowa Encounter (porada) -> POST /fhir/Encounter.
 * Uruchom: pnpm tsx scripts/smoke-zm-zdarzenie.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildMedicalEventEncounter,
  buildMedicalEventPatient,
  createFhirClient,
  requestAccessToken,
  toFhirGender,
} from "../packages/medical-events/src/index.js";
import { createNodeHttpClient, parseP12 } from "../packages/transport/src/index.js";
import { p1Account as a, p1AccountComplete } from "../test/integration/p1-account.js";

if (!p1AccountComplete) {
  console.error("Brak kompletu danych konta - uzupełnij `.local/p1.env`.");
  process.exit(1);
}

const tokenEndpoint = process.env.P1_ZM_TOKEN_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/token";
const fhirBaseUrl = process.env.P1_ZM_FHIR_URL ?? "https://isus.ezdrowie.gov.pl/fhir";

const wss = parseP12(resolve_(a, "wss"), a.certPassword);
const tls = parseP12(resolve_(a, "tls"), a.certPassword);
function resolve_(acc: typeof a, kind: string): Buffer {
  const file = kind === "wss" ? "Podmiot_leczniczy_713-wss.p12" : "Podmiot_leczniczy_713-tls.p12";
  return readFileSync(resolve(acc.certDir, file));
}
const httpClient = createNodeHttpClient({
  tls: {
    key: tls.privateKeyPem,
    cert: tls.certificatePem,
    rejectUnauthorized: a.rejectUnauthorized,
  },
});

async function main(): Promise<void> {
  const tokenResult = await requestAccessToken(
    {
      tokenEndpoint,
      privateKeyPem: wss.privateKeyPem,
      issuer: `${a.providerRoot}:${a.podmiotExt}`,
      subject: `${a.providerRoot}:${a.podmiotExt}`,
      userId: `${a.userRoot}:${a.npwz}`,
      userRole: "LEK",
      childOrganization: `${a.musRoot}:${a.podmiotExt}-${a.musExt}`,
    },
    httpClient,
  );
  if (!tokenResult.ok) {
    console.log("BŁĄD tokenu:", tokenResult.error.message);
    return;
  }
  console.log("Token OK");

  const fhir = createFhirClient({
    baseUrl: fhirBaseUrl,
    accessToken: tokenResult.value.accessToken,
    httpClient,
  });

  // 1) Pacjent z PESEL: najpierw wyszukaj (zwykle już istnieje w P1), w razie braku utwórz.
  const peselSystem = "urn:oid:2.16.840.1.113883.3.4424.1.1.616";
  const found = await fhir.search("Patient", {
    plpatient: `${peselSystem}|${a.patient.pesel}`,
    plgiven: a.patient.given,
    plfamily: a.patient.family,
  });
  if (!found.ok) {
    console.log("BŁĄD wyszukania Patient:", found.error.message);
    return;
  }
  let patientId = found.value.ids[0];
  if (!patientId) {
    const created = await fhir.create(
      "Patient",
      buildMedicalEventPatient({
        identifier: { system: peselSystem, value: a.patient.pesel },
        givenNames: [a.patient.given],
        familyName: a.patient.family,
        gender: toFhirGender(a.patient.gender),
        birthDate: `${a.patient.birth.slice(0, 4)}-${a.patient.birth.slice(4, 6)}-${a.patient.birth.slice(6, 8)}`,
      }),
    );
    if (!created.ok) {
      console.log("BŁĄD Patient:", created.error.message);
      return;
    }
    patientId = created.value.id;
  }
  console.log("Patient id:", patientId);

  const encounter = buildMedicalEventEncounter({
    identifierSystem: `urn:oid:2.16.840.1.113883.3.4424.2.7.${a.podmiotExt}.15.1`,
    identifierValue: randomUUID(),
    type: { code: "4", display: "Porada" },
    patient: {
      reference: `Patient/${patientId}`,
      pesel: a.patient.pesel,
      display: `${a.patient.given} ${a.patient.family}`.toUpperCase(),
      nfzBranch: a.nfzBranch,
    },
    practitioner: { npwz: a.npwz, display: "Adam713 Leczniczy", functionCode: "11" },
    organization: { identifier: a.podmiotExt, payorBranch: a.nfzBranch },
    location: { identifier: `${a.podmiotExt}-${a.musExt}` },
    period: { start: "2026-06-21T10:00:00+02:00", end: "2026-06-21T10:30:00+02:00" },
  });

  const result = await fhir.create("Encounter", encounter);

  console.log("\n=== WYNIK ===");
  if (result.ok) {
    console.log(
      "OK utworzono Encounter, id:",
      result.value.id,
      "| location:",
      result.value.location,
    );
  } else {
    console.log("BŁĄD:", result.error.kind, "-", result.error.message);
  }
}

main().catch((e: unknown) => {
  console.error("Wyjątek:", e);
  process.exit(1);
});
