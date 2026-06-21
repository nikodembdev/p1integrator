// Zdarzenie medyczne: porada. Inny stack niż recepta/skierowanie - REST/FHIR R4
// + OAuth2 (bez SOAP/CDA). Pełne zdarzenie to cztery zasoby FHIR po kolei:
// Patient (wyszukany po PESEL) -> Encounter (porada) -> Condition (rozpoznanie ICD-10)
// -> Provenance (autentyczność: podpis XAdES-BES nad utworzonymi zasobami).
// pnpm tsx examples/09-zdarzenie-porada.ts
import { randomUUID } from "node:crypto";
import {
  buildMedicalEventCondition,
  buildMedicalEventEncounter,
  buildMedicalEventProvenance,
  buildProvenanceSignature,
  createFhirClient,
  requestAccessToken,
} from "@p1/medical-events";
import { account, endpoints, patient, zmTransport } from "./config.js";

const zm = zmTransport();
if (!zm) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - zdarzenie wymaga sieci, pominięto.");
  process.exit(0);
}

// Wspólne dane lekarza/podmiotu używane w kilku zasobach.
const doctorDisplay = `${account.doctor.givenNames.join(" ")} ${account.doctor.familyName}`;
const cell = `${account.podmiotExt}-${account.musExt}`; // komórka organizacyjna
const peselSystem = "urn:oid:2.16.840.1.113883.3.4424.1.1.616";

// 1) Token OAuth2 (JWT podpisany kluczem WSS, wymiana na /token).
const token = await requestAccessToken(
  {
    tokenEndpoint: zm.tokenEndpoint,
    privateKeyPem: zm.privateKeyPem,
    issuer: `${account.providerRoot}:${account.podmiotExt}`,
    subject: `${account.providerRoot}:${account.podmiotExt}`,
    userId: `${account.npwzRoot}:${account.npwz}`,
    userRole: "LEK", // lekarz; inne role: FEL/PIEL/FARM/RAT...
    childOrganization: `${account.musRoot}:${cell}`,
  },
  zm.httpClient,
);
if (!token.ok) {
  console.error("❌ Token OAuth2:", token.error.kind, "-", token.error.message);
  process.exit(1);
}
console.log("✅ Token OAuth2");

const fhir = createFhirClient({
  baseUrl: zm.fhirBaseUrl,
  accessToken: token.value.accessToken,
  httpClient: zm.httpClient,
});

// 2) Pacjent z PESEL zwykle już jest w P1 - wyszukujemy (custom paramy P1).
const found = await fhir.search("Patient", {
  plpatient: `${peselSystem}|${patient.pesel}`,
  plgiven: patient.givenNames[0] ?? "",
  plfamily: patient.familyName,
});
if (!found.ok) {
  console.error("❌ Wyszukanie pacjenta:", found.error.message);
  process.exit(1);
}
const patientId = found.value.ids[0];
if (!patientId) {
  console.error("❌ Pacjent o PESEL", patient.pesel, "nie istnieje w P1 (utwórz go osobno).");
  process.exit(1);
}
console.log("   Patient:", patientId);

// 3) Encounter (porada).
const encResult = await fhir.create(
  "Encounter",
  buildMedicalEventEncounter({
    identifierSystem: `urn:oid:2.16.840.1.113883.3.4424.2.7.${account.podmiotExt}.15.1`,
    identifierValue: randomUUID(),
    type: { code: "4", display: "Porada" },
    patient: {
      reference: `Patient/${patientId}`,
      pesel: patient.pesel,
      display: `${patient.givenNames.join(" ")} ${patient.familyName}`.toUpperCase(),
      nfzBranch: account.nfzBranch,
    },
    practitioner: { npwz: account.npwz, display: doctorDisplay, functionCode: "11" },
    organization: { identifier: account.podmiotExt, payorBranch: account.nfzBranch },
    location: { identifier: cell },
    period: { start: "2026-06-21T10:00:00+02:00", end: "2026-06-21T10:30:00+02:00" },
  }),
);
if (!encResult.ok) {
  console.error("❌ Encounter:", encResult.error.message);
  process.exit(1);
}
const encounterId = encResult.value.id!;
console.log("   Encounter:", encounterId);

// 4) Condition (rozpoznanie ICD-10) - wymagane w zdarzeniu.
const condResult = await fhir.create(
  "Condition",
  buildMedicalEventCondition({
    patient: { reference: `Patient/${patientId}`, pesel: patient.pesel },
    encounter: { reference: `Encounter/${encounterId}` },
    location: { identifier: cell },
    diagnosis: { code: "J04.0", display: "Ostre zapalenie krtani" },
    recordedDate: "2026-06-21",
    asserter: { npwz: account.npwz, display: doctorDisplay, functionCode: "11" },
  }),
);
if (!condResult.ok) {
  console.error("❌ Condition:", condResult.error.message);
  process.exit(1);
}
const conditionId = condResult.value.id!;
console.log("   Condition:", conditionId);

// 5) Autentyczność: pobierz utworzone zasoby jako XML (z wersją), podpisz XAdES-BES
// nad ich wersjonowanymi URL-ami i wyślij Provenance.
const refs = [
  { type: "Patient", id: patientId },
  { type: "Encounter", id: encounterId },
  { type: "Condition", id: conditionId },
];
const signedResources = [];
for (const r of refs) {
  const read = await fhir.readXml(r.type, r.id);
  if (!read.ok) {
    console.error(`❌ Odczyt ${r.type}:`, read.error.message);
    process.exit(1);
  }
  signedResources.push({
    url: `${endpoints.zmFhir}/${r.type}/${r.id}/_history/${read.value.versionId}`,
    xml: read.value.xml,
  });
}

const when = new Date().toISOString();
const provResult = await fhir.create(
  "Provenance",
  buildMedicalEventProvenance({
    targets: refs.map((r) => ({ reference: `${r.type}/${r.id}`, type: r.type })),
    organization: { identifier: account.podmiotExt },
    when,
    signatureData: buildProvenanceSignature({
      resources: signedResources,
      certificatePem: zm.certificatePem,
      privateKeyPem: zm.privateKeyPem,
      signingTime: new Date(when),
    }),
  }),
);
if (!provResult.ok) {
  console.error("❌ Provenance (autentyczność):", provResult.error.message);
  process.exit(1);
}
console.log("✅ Zdarzenie kompletne, Provenance:", provResult.value.id);
