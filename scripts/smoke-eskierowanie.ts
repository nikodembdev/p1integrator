/**
 * Smoke-test e2e: buduje skierowanie ogólne naszą libką, podpisuje (XAdES przez
 * lokalny serwis), pakuje w kopertę SOAP+WS-Security, wysyła mTLS-em na P1 integrację
 * i wypisuje SUROWĄ odpowiedź. Wszystkie sekrety/certy z env/.local (nic w repo).
 *
 * Uruchom:
 *   CERT_PASSWORD='...' pnpm tsx scripts/smoke-eskierowanie.ts
 * Env (z domyślnymi dla podmiotu testowego 927722):
 *   CERT_DIR, CERT_PASSWORD, XADES_URL, P1_ENDPOINT, P1_TLS_REJECT_UNAUTHORIZED
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CallContext, HttpClient } from "../packages/core/src/index.js";
import { createDssDocumentSigner } from "../packages/signing/src/index.js";
import {
  buildGeneralReferralCda,
  type GeneralReferralInput,
  issueGeneralReferral,
  type ReferralTransport,
} from "../packages/referral/src/index.js";
import { createNodeHttpClient, parseP12 } from "../packages/transport/src/index.js";

const CERT_DIR =
  process.env.CERT_DIR ?? resolve(import.meta.dirname, "../.local/certs/Podmiot_leczniczy_713");
const PASSWORD = process.env.CERT_PASSWORD ?? "";
const XADES_URL = process.env.XADES_URL ?? "http://localhost:8080/api/v1/sign";
const P1_ENDPOINT =
  process.env.P1_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/services/ObslugaSkierowaniaWS";
const REJECT_UNAUTHORIZED = process.env.P1_TLS_REJECT_UNAUTHORIZED !== "false";

if (!PASSWORD) {
  console.error("Ustaw CERT_PASSWORD (hasło do .p12).");
  process.exit(1);
}

const doctorP12 = readFileSync(resolve(CERT_DIR, "Adam713 Leczniczy.p12"));
const tlsP12 = readFileSync(resolve(CERT_DIR, "Podmiot_leczniczy_713-tls.p12"));
const wssP12 = readFileSync(resolve(CERT_DIR, "Podmiot_leczniczy_713-wss.p12"));

// Kontekst wywołania = identyfikator BIZNESOWY podmiotu (root .2.3.1 + ext 000000927722),
// NPWZ lekarza w idUzytkownika, miejsce pracy 01. (To naprawia bladKontekstu.)
const context: CallContext = {
  subject: { root: "2.16.840.1.113883.3.4424.2.3.1", extension: "000000927722" },
  user: { root: "2.16.840.1.113883.3.4424.1.6.2", extension: "4727124" },
  workplace: {
    root: process.env.MUS_ROOT ?? "2.16.840.1.113883.3.4424.2.3.2",
    extension: process.env.MUS_EXT ?? "000000927722-01",
  },
  businessRole: "DOCTOR",
};

const input: GeneralReferralInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.1491",
  title: "Skierowanie do poradni specjalistycznej",
  nfzBranchCode: "06",
  patient: {
    // Dane z dokumentu, który przeszedł na integracji → pacjent zarejestrowany w CWUb.
    pesel: "40010151673",
    givenNames: ["Jon"],
    familyName: "BGTestowy",
    birthDate: "19400101",
    gender: "M",
    address: {
      city: "Warszawa",
      postalCode: "01-381",
      street: "Powstańców Śląskich",
      houseNumber: "8B",
      use: "PST",
    },
  },
  author: {
    authorExt: "4727124",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
    specialtyCode: "0713",
    specialtyDisplay: "medycyna rodzinna",
    givenNames: ["Adam"],
    familyName: "Leczniczy",
    organization: {
      // Dane podmiotu z dokumentu, który przeszedł (Jutro Medical, 927722).
      providerExt: "000000927722",
      providerRoot: "2.16.840.1.113883.3.4424.2.3.1",
      regon14: "23706493000004",
      regon9: "237064930",
      name: "Poradnia (gabinet) lekarza POZ",
      phone: "+48570690376",
      nfzBranchCode: "06",
      nfzContractNumber: "070606525210601",
      orgUnitExt: "000000927722-01",
      orgUnitName: "Warszawa",
      cellSpecialtyCode: "0010",
      cellSpecialtyName: "Poradnia (gabinet) lekarza POZ",
      address: {
        postalCode: "01-797",
        city: "Warszawa",
        street: "Powązkowska",
        houseNumber: "44",
      },
    },
  },
  legalAuthenticator: {
    authorExt: "4727124",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
  },
  diagnoses: {
    main: {
      icd10Code: "J45",
      icd10Name: "Astma oskrzelowa",
      description: "Astma oskrzelowa",
    },
  },
  procedures: {
    place: { code: "0010", name: "Poradnia (gabinet) lekarza POZ" },
    procedures: [{ icd9Code: "89.00", icd9Name: "Porada lekarska" }],
  },
};

// Node odrzuca stary szyfr PKCS12 P1 ("Unsupported PKCS12 PFX data"), więc rozpakowujemy
// klucz+cert TLS przez node-forge (parseP12) i podajemy jako PEM.
const tlsParsed = parseP12(tlsP12, PASSWORD);
const baseHttp = createNodeHttpClient({
  tls: {
    key: tlsParsed.privateKeyPem,
    cert: tlsParsed.certificatePem,
    rejectUnauthorized: REJECT_UNAUTHORIZED,
  },
});
const httpClient: HttpClient = {
  async send(request) {
    console.log(`\n→ POST ${request.url}`);
    let response;
    try {
      response = await baseHttp.send(request);
    } catch (e) {
      console.error("✗ błąd HTTP:", e);
      throw e;
    }
    console.log(`← HTTP ${response.status}`);
    console.log("─── surowa odpowiedź P1 ───\n" + response.body + "\n───────────────────────────");
    return response;
  },
};

const transport: ReferralTransport = {
  context,
  documentSigner: createDssDocumentSigner({
    endpoint: XADES_URL,
    certificate: { p12: doctorP12, password: PASSWORD },
  }),
  httpClient,
  wsSecurityCertificate: parseP12(wssP12, PASSWORD),
  endpoint: P1_ENDPOINT,
};

async function main(): Promise<void> {
  const cda = buildGeneralReferralCda(input).xml;
  const { writeFileSync } = await import("node:fs");
  writeFileSync(resolve(import.meta.dirname, "../.local/smoke-cda.xml"), cda);
  console.log("CDA długość:", cda.length, "znaków");
  console.log("Wysyłam skierowanie ogólne na:", P1_ENDPOINT);
  const result = await issueGeneralReferral(input, transport);
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
