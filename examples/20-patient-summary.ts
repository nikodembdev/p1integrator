// Patient Summary (Karta Pacjenta): pobranie podsumowania pacjenta (HL7 CDA) z P1.
// Token OAuth2 (private_key_jwt, scope patient-summary) + GET /patient-summary/{format}.
// pnpm tsx examples/20-patient-summary.ts
import { requestAccessToken } from "@p1/medical-events";
import {
  fetchPatientSummary,
  PATIENT_SUMMARY_SCOPE,
  type PatientSummaryContext,
  PESEL_OID,
} from "@p1/patient-summary";
import { account, endpoints, patient, zmTransport } from "./config.js";

const e = process.env;
const psPatientPesel = e.P1_PS_PATIENT ?? patient.pesel;

const zm = zmTransport();
if (!zm) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - pominięto.");
  process.exit(0);
}

// 1. Token dostępu OAuth2 dla usługi Patient Summary (scope patient-summary).
const token = await requestAccessToken(
  {
    tokenEndpoint: endpoints.patientSummaryToken,
    privateKeyPem: zm.privateKeyPem,
    issuer: `${account.providerRoot}:${account.podmiotExt}`,
    subject: `${account.providerRoot}:${account.podmiotExt}`,
    userId: `${account.npwzRoot}:${account.npwz}`,
    userRole: "LEK",
    childOrganization: `${account.musRoot}:${account.podmiotExt}-${account.musExt}`,
    purpose: "BTG", // Break The Glass - dostęp ratunkowy
    scope: PATIENT_SUMMARY_SCOPE,
  },
  zm.httpClient,
);
if (!token.ok) {
  console.error("Nie udało się uzyskać tokenu PS:", token.error.message);
  process.exit(1);
}
console.log("Token PS uzyskany.");

// 2. Kontekst dostępu (nagłówki) + pobranie Karty Pacjenta jako HL7 CDA.
const context: PatientSummaryContext = {
  patient: { root: PESEL_OID, extension: psPatientPesel },
  subject: { root: account.providerRoot, extension: account.podmiotExt },
  workplace: { root: account.musRoot, extension: `${account.podmiotExt}-${account.musExt}` },
  user: { root: account.npwzRoot, extension: account.npwz },
  userRole: "LEK",
  accessMode: "BTG",
};

const result = await fetchPatientSummary("HL7_CDA", context, {
  httpClient: zm.httpClient,
  baseUrl: endpoints.patientSummary,
  accessToken: token.value.accessToken,
});

if (!result.ok) {
  console.error(`Błąd pobrania Patient Summary [${result.error.kind}]:`, result.error.message);
  process.exit(1);
}

console.log(`\nKarta Pacjenta pobrana. idDokumentu=${result.value.documentId ?? "-"}`);
console.log(`Wygenerowano: ${result.value.generatedAt ?? "-"}`);
if (result.value.cdaXml) {
  console.log(`Treść CDA: ${result.value.cdaXml.length} znaków`);
  console.log(result.value.cdaXml.split("\n").slice(0, 5).join("\n"));
}
