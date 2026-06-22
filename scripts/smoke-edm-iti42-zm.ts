/**
 * Smoke EDM Faza 2 (pełny Sukces): utworz zdarzenie ZM (Encounter) -> zapisz indeks
 * EDM ITI-42 wskazujacy to zdarzenie (MedicalEventId). Pokazuje link EDM<->ZM.
 * Uruchom: pnpm tsx scripts/smoke-edm-iti42-zm.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CallContext } from "../packages/core/src/index.js";
import {
  type DocumentIndexInput,
  registerDocumentSet,
  requestSamlToken,
} from "../packages/edm/src/index.js";
import {
  buildMedicalEventEncounter,
  createFhirClient,
  requestAccessToken,
} from "../packages/medical-events/src/index.js";
import { createNodeHttpClient, parseP12 } from "../packages/transport/src/index.js";
import { p1Account as a, p1AccountComplete } from "../test/integration/p1-account.js";

if (!p1AccountComplete) {
  console.error("Brak kompletu danych konta - uzupełnij `.local/p1.env`.");
  process.exit(1);
}

const zmTokenEndpoint = process.env.P1_ZM_TOKEN_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/token";
const zmFhirUrl = process.env.P1_ZM_FHIR_URL ?? "https://isus.ezdrowie.gov.pl/fhir";
const edmTokenEndpoint =
  process.env.P1_EDM_TOKEN_ENDPOINT ??
  "https://isus.ezdrowie.gov.pl/services/ObslugaGenerowanieTokenuSamlWS";
const iti42Endpoint =
  process.env.P1_EDM_ITI42_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/services/ObslugaEdmIti42WS";

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
const eventOid = `2.16.840.1.113883.3.4424.2.7.${a.podmiotExt}.15.1`;
const eventValue = randomUUID();

const context: CallContext = {
  subject: { root: a.providerRoot, extension: a.podmiotExt },
  user: { root: a.userRoot, extension: a.npwz },
  workplace: { root: a.musRoot, extension: `${a.podmiotExt}-${a.musExt}` },
  businessRole: "DOCTOR",
};
// Czas wysyłki w DTM musi być w ±15 min od czasu serwera P1 (lokalny PL, UTC+2 latem) - REG.WER.4636.
const ts = new Date(Date.now() + 2 * 60 * 60 * 1000)
  .toISOString()
  .replace(/[-:T]/g, "")
  .slice(0, 14);

async function createEncounter(): Promise<boolean> {
  const token = await requestAccessToken(
    {
      tokenEndpoint: zmTokenEndpoint,
      privateKeyPem: wss.privateKeyPem,
      issuer: `${a.providerRoot}:${a.podmiotExt}`,
      subject: `${a.providerRoot}:${a.podmiotExt}`,
      userId: `${a.userRoot}:${a.npwz}`,
      userRole: "LEK",
      childOrganization: `${a.musRoot}:${a.podmiotExt}-${a.musExt}`,
    },
    httpClient,
  );
  if (!token.ok) {
    console.log("BŁĄD tokenu ZM:", token.error.message);
    return false;
  }
  const fhir = createFhirClient({
    baseUrl: zmFhirUrl,
    accessToken: token.value.accessToken,
    httpClient,
  });

  const found = await fhir.search("Patient", {
    plpatient: `urn:oid:${PESEL_OID}|${a.patient.pesel}`,
    plgiven: a.patient.given,
    plfamily: a.patient.family,
  });
  if (!found.ok || !found.value.ids[0]) {
    console.log("BŁĄD wyszukania pacjenta ZM:", found.ok ? "brak" : found.error.message);
    return false;
  }
  const patientId = found.value.ids[0];

  const encResult = await fhir.create(
    "Encounter",
    buildMedicalEventEncounter({
      identifierSystem: `urn:oid:${eventOid}`,
      identifierValue: eventValue,
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
    }),
  );
  if (!encResult.ok) {
    console.log("BŁĄD Encounter ZM:", encResult.error.message);
    return false;
  }
  console.log("Zdarzenie ZM utworzone:", encResult.value.id, "| MedicalEventId:", eventValue);
  return true;
}

function buildIndex(): DocumentIndexInput {
  const author = {
    person: {
      id: a.npwz,
      familyName: "Leczniczy",
      givenName: "Adam713",
      assigningAuthorityOid: a.userRoot,
    },
    institution: { name: "Przychodnia", oid: a.providerRoot, idExtension: a.podmiotExt },
    role: "Lekarz",
  };
  return {
    submissionSet: {
      submissionUuid: `urn:uuid:${randomUUID()}`,
      uniqueId: {
        root: `${a.localRoot}.20`,
        extension: randomUUID().replace(/-/g, "").slice(0, 16),
      },
      sourceId: a.localRoot,
      submissionTime: ts,
      author,
      patientId: patientCx,
    },
    document: {
      entryUuid: `urn:uuid:${randomUUID()}`,
      uniqueId: {
        root: `${a.localRoot}.21`,
        extension: randomUUID().replace(/-/g, "").slice(0, 16),
      },
      repositoryUniqueId: `${a.localRoot}.24.1`,
      mimeType: "text/xml",
      hash: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
      size: 4096,
      creationTime: ts,
      title: "Karta informacyjna leczenia szpitalnego",
      uri: "dokument.xml",
      medicalEvent: { id: eventValue, oid: eventOid },
      sourcePatient: {
        id: a.patient.pesel,
        oid: `${a.localRoot}.17.1`,
        info: {
          familyName: a.patient.family,
          givenName: a.patient.given,
          birthDate: a.patient.birth,
          gender: "M",
          city: "Warszawa",
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
      patientId: patientCx,
    },
  };
}

async function main(): Promise<void> {
  if (!(await createEncounter())) return;

  const token = await requestSamlToken(
    {
      endpoint: edmTokenEndpoint,
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

  const result = await registerDocumentSet(
    {
      endpoint: iti42Endpoint,
      index: buildIndex(),
      assertionXml: token.value.assertionXml,
      wsSecurityCertificate: wss,
    },
    httpClient,
  );

  console.log("\n=== WYNIK ITI-42 ===");
  if (!result.ok) {
    console.log("BŁĄD:", result.error.kind, "-", result.error.message);
    return;
  }
  console.log("status:", result.value.status, "| success:", result.value.success);
  for (const e of result.value.errors) {
    console.log(`  - [${e.severity ?? "?"}] ${e.errorCode ?? ""}: ${e.codeContext ?? ""}`);
  }
}

main().catch((e: unknown) => {
  console.error("Wyjątek:", e);
  process.exit(1);
});
