/**
 * Konfiguracja konta integracyjnego P1 czytana WYŁĄCZNIE z env. Realne wartości trzymaj w `.local/p1.env` (gitignored) — jest ładowany
 * automatycznie; wzór kluczy: `.env.example`.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CallContext } from "@p1/core";
import type { GeneralReferralInput } from "@p1/referral";
import type { DrugPrescriptionInput } from "@p1/prescription";

const ENV_FILE = resolve(import.meta.dirname, "../../.local/p1.env");
if (existsSync(ENV_FILE) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(ENV_FILE);
}

const e = process.env;

const OID = {
  PROVIDER: "2.16.840.1.113883.3.4424.2.3.1",
  NPWZ: "2.16.840.1.113883.3.4424.1.6.2",
} as const;

export const p1Account = {
  certDir:
    e.P1_CERT_DIR ?? resolve(import.meta.dirname, "../../.local/certs/Podmiot_leczniczy_713"),
  certPassword: e.CERT_PASSWORD ?? e.P1_CERT_PASSWORD ?? "",
  xadesUrl: e.P1_XADES_URL ?? "http://localhost:8080/api/v1/sign",
  endpoint: e.P1_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/services/ObslugaSkierowaniaWS",
  receptaEndpoint:
    e.P1_RECEPTA_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/services/ObslugaReceptyWS",
  // Recepta: id → <wezeł>.2.1 (rootRecepty). Domyślnie NASZ węzeł OID (P1_LOCAL_ROOT) —
  // REG.WER.376 wymaga zgodności węzła w numerze recepty z kontekstem wywołania.
  receptaLocalRoot: e.P1_RECEPTA_LOCAL_ROOT ?? e.P1_LOCAL_ROOT ?? "",
  versionSetRoot: e.P1_RECEPTA_VERSIONSET_ROOT ?? `${e.P1_LOCAL_ROOT ?? ""}.2.2`,
  rejectUnauthorized: e.P1_TLS_REJECT_UNAUTHORIZED !== "false",

  providerRoot: OID.PROVIDER,
  userRoot: OID.NPWZ,
  localRoot: e.P1_LOCAL_ROOT ?? "",
  podmiotExt: e.P1_PODMIOT_EXT ?? "",
  npwz: e.P1_NPWZ ?? "",
  regon14: e.P1_REGON14 ?? "",
  regon9: e.P1_REGON9 ?? "",
  nfzBranch: e.P1_NFZ_BRANCH ?? "",
  nfzContract: e.P1_NFZ_CONTRACT ?? "",
  orgUnitExt: e.P1_ORG_UNIT_EXT ?? "",
  musRoot: e.P1_MUS_ROOT ?? "2.16.840.1.113883.3.4424.2.3.3",
  musExt: e.P1_MUS_EXT ?? "",

  patient: {
    pesel: e.P1_PATIENT_PESEL ?? "",
    given: e.P1_PATIENT_GIVEN ?? "",
    family: e.P1_PATIENT_FAMILY ?? "",
    birth: e.P1_PATIENT_BIRTH ?? "",
    gender: (e.P1_PATIENT_GENDER as "M" | "F" | undefined) ?? "M",
  },
} as const;

/** Czy mamy komplet danych konta + pacjenta do realnego strzału w P1. */
export const p1AccountComplete = Boolean(
  p1Account.certPassword &&
  p1Account.localRoot &&
  p1Account.podmiotExt &&
  p1Account.npwz &&
  p1Account.regon14 &&
  p1Account.nfzContract &&
  p1Account.orgUnitExt &&
  p1Account.musExt &&
  p1Account.patient.pesel &&
  p1Account.patient.birth,
);

/** Kontekst wywołania zbudowany z danych konta (env). */
export const e2eContext: CallContext = {
  subject: { root: p1Account.providerRoot, extension: p1Account.podmiotExt },
  user: { root: p1Account.userRoot, extension: p1Account.npwz },
  workplace: { root: p1Account.musRoot, extension: p1Account.musExt },
  businessRole: "DOCTOR",
};

/** Przykładowe skierowanie ogólne dla danego pacjenta/podmiotu (dane konta z env, reszta generyczna). */
export function buildE2eGeneralInput(): GeneralReferralInput {
  const a = p1Account;
  return {
    localRoot: a.localRoot,
    title: "Skierowanie do poradni specjalistycznej",
    nfzBranchCode: a.nfzBranch,
    patient: {
      pesel: a.patient.pesel,
      givenNames: [a.patient.given],
      familyName: a.patient.family,
      birthDate: a.patient.birth,
      gender: a.patient.gender,
      address: {
        city: "Warszawa",
        postalCode: "01-381",
        street: "Powstańców Śląskich",
        houseNumber: "8B",
        use: "PST",
      },
    },
    author: {
      authorExt: a.npwz,
      authorRoot: a.userRoot,
      functionCode: "LEK",
      functionDisplay: "Lekarz",
      specialtyCode: "0713",
      specialtyDisplay: "medycyna rodzinna",
      givenNames: ["Adam"],
      familyName: "Leczniczy",
      organization: {
        providerExt: a.podmiotExt,
        providerRoot: a.providerRoot,
        regon14: a.regon14,
        regon9: a.regon9,
        name: "Poradnia (gabinet) lekarza POZ",
        phone: "+48570690376",
        nfzBranchCode: a.nfzBranch,
        nfzContractNumber: a.nfzContract,
        orgUnitExt: a.orgUnitExt,
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
      authorExt: a.npwz,
      authorRoot: a.userRoot,
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
}

/**
 * Przykładowa recepta na lek dla danego pacjenta/podmiotu (dane konta z env).
 * `prescriptionNumber` musi być unikalny — generowany z czasu wywołania.
 * Dane leku z oficjalnego wzorca (RPL_PL format: kod 100000xxx + EAN GS1).
 */
/** Dzisiejsza data w formacie YYYYMMDD. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export function buildE2ePrescriptionInput(
  overrides: Partial<DrugPrescriptionInput> = {},
): DrugPrescriptionInput {
  const a = p1Account;
  // Numer recepty: 22 znaki UUID hex (uppercase, bez myślników) — format wymagany przez REG.WER.213.
  const prescriptionNumber =
    overrides.prescriptionNumber ?? randomUUID().replace(/-/g, "").toUpperCase().slice(0, 22);
  return {
    localRoot: a.receptaLocalRoot,
    prescriptionNumber,
    versionSetId: { root: a.versionSetRoot, extension: prescriptionNumber },
    patient: {
      pesel: a.patient.pesel,
      givenNames: [a.patient.given],
      familyName: a.patient.family,
      birthDate: a.patient.birth,
      gender: a.patient.gender,
      address: {
        postalCode: "01-381",
        city: "Warszawa",
        street: "Powstańców Śląskich",
        houseNumber: "8B",
      },
    },
    author: {
      npwz: a.npwz,
      givenNames: ["Adam"],
      familyName: "Leczniczy",
      organization: {
        podmiotExt: a.podmiotExt,
        regon14: a.regon14,
        name: "Poradnia (gabinet) lekarza POZ",
        phone: "+48570690376",
        address: {
          postalCode: "01-797",
          city: "Warszawa",
          street: "Powązkowska",
          houseNumber: "44",
        },
      },
    },
    legalAuthenticator: { npwz: a.npwz },
    drug: {
      code: "100000126",
      name: "Zofran",
      availabilityCategory: "Rp",
      packageEan: "05909990805617",
      packageName: "Zofran 8 mg",
      // formCode = POSTAĆ OPAKOWANIA (PostacOpakowaniaLeku, EDQM container), nie postać dawkowania.
      formCode: "30066000",
      formName: "Tablet container",
      capacityUnit: "tabl.",
      capacityValue: "10",
      ingredients: [
        {
          numeratorValue: "8",
          numeratorUnit: "mg",
          denominatorValue: "1",
          code: "23432",
          name: "Ondansetronum",
        },
      ],
    },
    dosage: {
      // dawkowanie strukturalne — narracja liczona przez builder ("3 x dziennie po 1 szt.")
      periodUnit: "h",
      periodValue: "8",
      doseQuantity: "1",
      startDate: today(),
    },
    payment: { nfzBranch: a.nfzBranch, level: "100%", packageCount: "1" },
    ...overrides,
    prescriptionNumber,
  };
}
