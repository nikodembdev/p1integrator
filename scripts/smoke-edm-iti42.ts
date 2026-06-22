/**
 * Smoke EDM Faza 2: token SAML -> zapis indeksu EDM (ITI-42 RegisterDocumentSet-b).
 * Uruchom: pnpm tsx scripts/smoke-edm-iti42.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type DocumentIndexInput,
  registerDocumentSet,
  requestSamlToken,
} from "../packages/edm/src/index.js";
import type { CallContext } from "../packages/core/src/index.js";
import { createNodeHttpClient, parseP12 } from "../packages/transport/src/index.js";
import { p1Account as a, p1AccountComplete } from "../test/integration/p1-account.js";

if (!p1AccountComplete) {
  console.error("Brak kompletu danych konta - uzupełnij `.local/p1.env`.");
  process.exit(1);
}

const tokenEndpoint =
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
const XDS_DOMAIN_OID = "2.16.840.1.113883.3.4424.15"; // Krajowa Domena XDS
const patientCx = `${a.patient.pesel}^^^&${PESEL_OID}&ISO`;

const context: CallContext = {
  subject: { root: a.providerRoot, extension: a.podmiotExt },
  user: { root: a.userRoot, extension: a.npwz },
  workplace: { root: a.musRoot, extension: `${a.podmiotExt}-${a.musExt}` },
  businessRole: "DOCTOR",
};

const now = new Date();
const ts = now.toISOString().replace(/[-:T]/g, "").slice(0, 14); // YYYYMMDDHHMMSS

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
    console.log("BŁĄD tokenu:", token.error.message);
    return;
  }
  console.log("Token OK:", token.value.assertionId);

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
