/**
 * Test e2e: realnie wystawia skierowanie na P1 INTEGRACJĘ przez naszą libkę
 * (XAdES → SOAP+WS-Security → mTLS → WynikMT) i sprawdza, że P1 zwraca Sukces.
 *
 * TWORZY REALNY DOKUMENT na integracji (zwraca kodSkierowania). Domyślnie POMIJANY.
 * Uruchom świadomie:
 *   P1_E2E=1 CERT_PASSWORD='…' pnpm test:e2e
 * Wymaga: certów w .local/certs (lub CERT_DIR) i działającego serwisu XAdES (XADES_URL).
 * Env: CERT_DIR, CERT_PASSWORD, XADES_URL, P1_ENDPOINT, MUS_ROOT, MUS_EXT, P1_TLS_REJECT_UNAUTHORIZED.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CallContext } from "@p1/core";
import {
  type GeneralReferralInput,
  issueGeneralReferral,
  type ReferralTransport,
} from "@p1/referral";
import { createDssDocumentSigner } from "@p1/signing";
import { createNodeHttpClient, parseP12 } from "@p1/transport";
import { describe, expect, it } from "vitest";

const CERT_DIR = process.env.CERT_DIR ?? fileURLDir("../../.local/certs/Podmiot_leczniczy_713");
const PASSWORD = process.env.CERT_PASSWORD ?? "";
const RUN = process.env.P1_E2E === "1";

function fileURLDir(rel: string): string {
  return resolve(import.meta.dirname, rel);
}

const certsPresent =
  existsSync(resolve(CERT_DIR, "Adam713 Leczniczy.p12")) &&
  existsSync(resolve(CERT_DIR, "Podmiot_leczniczy_713-tls.p12")) &&
  existsSync(resolve(CERT_DIR, "Podmiot_leczniczy_713-wss.p12"));

// Dane testowe podmiotu 927722 / pacjent z CWUb (patrz .local/INTEGRACJA-DOSTEP.md).
const context: CallContext = {
  subject: { root: "2.16.840.1.113883.3.4424.2.3.1", extension: "000000927722" },
  user: { root: "2.16.840.1.113883.3.4424.1.6.2", extension: "4727124" },
  workplace: {
    root: process.env.MUS_ROOT ?? "2.16.840.1.113883.3.4424.2.3.3",
    extension: process.env.MUS_EXT ?? "001",
  },
  businessRole: "DOCTOR",
};

const input: GeneralReferralInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.1491",
  title: "Skierowanie do poradni specjalistycznej",
  nfzBranchCode: "06",
  patient: {
    pesel: "40010151673", // Sylwester Senior — zarejestrowany w CWUb
    givenNames: ["Sylwester"],
    familyName: "Senior",
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
      address: { postalCode: "01-797", city: "Warszawa", street: "Powązkowska", houseNumber: "44" },
    },
  },
  legalAuthenticator: {
    authorExt: "4727124",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
  },
  diagnoses: {
    main: { icd10Code: "J45", icd10Name: "Astma oskrzelowa", description: "Astma oskrzelowa" },
  },
  procedures: {
    place: { code: "0010", name: "Poradnia (gabinet) lekarza POZ" },
    procedures: [{ icd9Code: "89.00", icd9Name: "Porada lekarska" }],
  },
};

describe.skipIf(!RUN || !PASSWORD || !certsPresent)(
  "e2e P1 integracja — wystawienie skierowania",
  () => {
    it("zwraca Sukces i kodSkierowania", async () => {
      const transport: ReferralTransport = {
        context,
        documentSigner: createDssDocumentSigner({
          endpoint: process.env.XADES_URL ?? "http://localhost:8080/api/v1/sign",
          certificate: {
            p12: readFileSync(resolve(CERT_DIR, "Adam713 Leczniczy.p12")),
            password: PASSWORD,
          },
        }),
        httpClient: createNodeHttpClient({
          tls: {
            ...parseP12Tls(resolve(CERT_DIR, "Podmiot_leczniczy_713-tls.p12"), PASSWORD),
            rejectUnauthorized: process.env.P1_TLS_REJECT_UNAUTHORIZED !== "false",
          },
        }),
        wsSecurityCertificate: parseP12(
          readFileSync(resolve(CERT_DIR, "Podmiot_leczniczy_713-wss.p12")),
          PASSWORD,
        ),
        endpoint:
          process.env.P1_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/services/ObslugaSkierowaniaWS",
      };

      const result = await issueGeneralReferral(input, transport);
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (result.ok) {
        expect(result.value.outcome?.major).toBe("urn:csioz:p1:kod:major:Sukces");
        expect(result.value.referralCode).toBeTruthy();
        // eslint-disable-next-line no-console
        console.log("P1 OK — kodSkierowania:", result.value.referralCode);
      }
    });
  },
);

/** Node odrzuca stary szyfr PKCS12 P1 → klucz/cert jako PEM. */
function parseP12Tls(path: string, password: string): { key: string; cert: string } {
  const parsed = parseP12(readFileSync(path), password);
  return { key: parsed.privateKeyPem, cert: parsed.certificatePem };
}
