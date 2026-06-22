// EDM: publikacja indeksu dokumentu spiętego ze zdarzeniem medycznym.
// Pełny przepływ: utworzenie zdarzenia ZM -> token SAML -> ITI-42 zapis indeksu.
// pnpm tsx examples/12-edm-publikacja-indeksu.ts
import { randomUUID } from "node:crypto";
import { type DocumentIndexInput, registerDocumentSet, requestSamlToken } from "@p1/edm";
import {
  buildMedicalEventEncounter,
  createFhirClient,
  requestAccessToken,
} from "@p1/medical-events";
import {
  account,
  edmContext,
  edmPatientCx,
  EDM_OID,
  edmTransport,
  endpoints,
  patient,
} from "./config.js";

const edm = edmTransport();
if (!edm) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - przykład wymaga połączenia z P1.");
  process.exit(0);
}

const eventOid = EDM_OID.medicalEvent(account.podmiotExt);
const eventValue = randomUUID();
// Czas w DTM musi być w +-15 min od czasu serwera P1 (lokalny PL, UTC+2 latem).
const ts = new Date(Date.now() + 2 * 60 * 60 * 1000)
  .toISOString()
  .replace(/[-:T]/g, "")
  .slice(0, 14);
// Okres zdarzenia (porada) - niedawna przeszłość w czasie lokalnym PL (+02:00).
const plIso = (offsetMs: number): string =>
  new Date(Date.now() + 2 * 60 * 60 * 1000 + offsetMs).toISOString().replace(/\.\d{3}Z$/, "+02:00");
const periodStart = plIso(-35 * 60 * 1000);
const periodEnd = plIso(-5 * 60 * 1000);

// 1) Zdarzenie medyczne w ZM (indeks EDM musi wskazywać realne zdarzenie - REG.WER.6860).
const zmToken = await requestAccessToken(
  {
    tokenEndpoint: endpoints.zmToken,
    privateKeyPem: edm.wsSecurityCertificate.privateKeyPem,
    issuer: `${account.providerRoot}:${account.podmiotExt}`,
    subject: `${account.providerRoot}:${account.podmiotExt}`,
    userId: `${account.npwzRoot}:${account.npwz}`,
    userRole: "LEK",
    childOrganization: `${account.musRoot}:${account.podmiotExt}-${account.musExt}`,
  },
  edm.httpClient,
);
if (!zmToken.ok) {
  console.error("❌ token ZM:", zmToken.error.message);
  process.exit(1);
}
const fhir = createFhirClient({
  baseUrl: endpoints.zmFhir,
  accessToken: zmToken.value.accessToken,
  httpClient: edm.httpClient,
});
const found = await fhir.search("Patient", {
  plpatient: `urn:oid:${EDM_OID.pesel}|${patient.pesel}`,
  plgiven: patient.givenNames[0] ?? "",
  plfamily: patient.familyName,
});
const patientId = found.ok ? found.value.ids[0] : undefined;
if (!patientId) {
  console.error("❌ Nie znaleziono pacjenta w ZM.");
  process.exit(1);
}
const enc = await fhir.create(
  "Encounter",
  buildMedicalEventEncounter({
    identifierSystem: `urn:oid:${eventOid}`,
    identifierValue: eventValue,
    type: { code: "4", display: "Porada" },
    patient: {
      reference: `Patient/${patientId}`,
      pesel: patient.pesel,
      display: `${patient.givenNames.join(" ")} ${patient.familyName}`.toUpperCase(),
      nfzBranch: account.nfzBranch,
    },
    practitioner: {
      npwz: account.npwz,
      display: `${account.doctor.givenNames.join(" ")} ${account.doctor.familyName}`,
      functionCode: "11",
    },
    organization: { identifier: account.podmiotExt, payorBranch: account.nfzBranch },
    location: { identifier: `${account.podmiotExt}-${account.musExt}` },
    period: { start: periodStart, end: periodEnd },
  }),
);
if (!enc.ok) {
  console.error("❌ Encounter ZM:", enc.error.message);
  process.exit(1);
}
console.log("✅ Zdarzenie ZM:", enc.value.id, "| MedicalEventId:", eventValue);

// 2) Token SAML do operacji EDM.
const token = await requestSamlToken(
  {
    endpoint: endpoints.edmToken,
    context: edmContext,
    wsSecurityCertificate: edm.wsSecurityCertificate,
    patient: { root: EDM_OID.pesel, extension: patient.pesel },
  },
  edm.httpClient,
);
if (!token.ok) {
  console.error("❌ token SAML:", token.error.message);
  process.exit(1);
}
console.log("✅ Token SAML:", token.value.assertionId);

// 3) ITI-42: zapis indeksu wskazującego repozytorium (Twoje) i zdarzenie medyczne.
const author = {
  person: {
    id: account.npwz,
    familyName: account.doctor.familyName,
    givenName: account.doctor.givenNames[0] ?? "",
    assigningAuthorityOid: account.npwzRoot,
  },
  institution: {
    name: account.organizationName,
    oid: account.providerRoot,
    idExtension: account.podmiotExt,
  },
  role: "Lekarz",
};
const index: DocumentIndexInput = {
  submissionSet: {
    submissionUuid: `urn:uuid:${randomUUID()}`,
    uniqueId: {
      root: `${account.localRoot}.20`,
      extension: randomUUID().replace(/-/g, "").slice(0, 16),
    },
    sourceId: account.localRoot,
    submissionTime: ts,
    author,
    patientId: edmPatientCx,
  },
  document: {
    entryUuid: `urn:uuid:${randomUUID()}`,
    uniqueId: {
      root: `${account.localRoot}.21`,
      extension: randomUUID().replace(/-/g, "").slice(0, 16),
    },
    repositoryUniqueId: `${account.localRoot}.24.1`, // identyfikator Twojego repozytorium (z SZAR)
    mimeType: "text/xml",
    hash: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
    size: 4096,
    creationTime: ts,
    title: "Karta informacyjna leczenia szpitalnego",
    uri: "dokument.xml",
    medicalEvent: { id: eventValue, oid: eventOid },
    sourcePatient: {
      id: patient.pesel,
      oid: `${account.localRoot}.17.1`,
      info: {
        familyName: patient.familyName,
        givenName: patient.givenNames[0] ?? "",
        birthDate: patient.birthDate,
        gender: patient.gender,
        city: patient.address.city,
      },
    },
    author,
    typeP1: {
      code: "06.10",
      codingScheme: "Klasyfikacja dokumentów P1",
      displayName: "Karta informacyjna leczenia szpitalnego",
    },
    typeLoinc: {
      code: "34105-7",
      codingScheme: "LOINC",
      displayName: "Hospital discharge summary",
    },
    confidentiality: { code: "N", codingScheme: "2.16.840.1.113883.5.25", displayName: "normal" },
    format: {
      code: "urn:extPL:pl-cda",
      codingScheme: "Kody formatów P1",
      displayName: "PIK HL7 CDA",
    },
    facilityType: {
      code: "1008",
      codingScheme: "Specjalność komórki organizacyjnej",
      displayName: "Szpital uzdrowiskowy dla dzieci",
    },
    practiceSetting: {
      code: "05",
      codingScheme: "Dziedzina medyczna",
      displayName: "Chirurgia ogólna",
    },
    patientId: edmPatientCx,
  },
};

const result = await registerDocumentSet(
  {
    endpoint: endpoints.edmIti42,
    index,
    assertionXml: token.value.assertionXml,
    wsSecurityCertificate: edm.wsSecurityCertificate,
  },
  edm.httpClient,
);
console.log("\n=== ITI-42 ===");
if (!result.ok) {
  console.error("❌", result.error.kind, "-", result.error.message);
  process.exit(1);
}
console.log(result.value.success ? "✅ Indeks zapisany (Success)" : `❌ ${result.value.status}`);
for (const e of result.value.errors) console.log("  -", e.errorCode, e.codeContext);
