// Wspólne dla przykładów: dane konta, kontekst i złożenie transportu (mTLS +
// podpisywarka XAdES + cert WS-Security), żeby pojedynczy przykład zajmował się
// tylko danymi dokumentu. Wartości z `.local/p1.env` (wzór: `.env.example`);
// bez certów transport jest niedostępny i przykłady tylko budują dokument.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CallContext } from "@p1/core";
import { createXadesDocumentSigner } from "@p1/signing";
import { createNodeHttpClient, parseP12, type WsSecurityCertificate } from "@p1/transport";
import type { DocumentSigner, HttpClient } from "@p1/core";

const ENV_FILE = resolve(import.meta.dirname, "../.local/p1.env");
if (existsSync(ENV_FILE) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(ENV_FILE);
}
const e = process.env;

/** Stałe OID-y P1 (root-y identyfikatorów). */
const OID = {
  PROVIDER: "2.16.840.1.113883.3.4424.2.3.1", // podmiot (idPodmiotu)
  NPWZ: "2.16.840.1.113883.3.4424.1.6.2", // numer prawa wykonywania zawodu
  MUS: "2.16.840.1.113883.3.4424.2.3.3", // komórka organizacyjna (miejsce pracy)
} as const;

/**
 * Dane konta i lekarza. Z env, a w razie braku - przykładowe placeholdery (dokument
 * zbuduje się offline, ale realna wysyłka wymaga prawdziwych wartości z przydziału CSIOZ).
 */
export const account = {
  localRoot: e.P1_LOCAL_ROOT ?? "2.16.840.1.113883.3.4424.2.7.999",
  podmiotExt: e.P1_PODMIOT_EXT ?? "000000000000",
  providerRoot: OID.PROVIDER,
  npwz: e.P1_NPWZ ?? "1234567",
  npwzRoot: OID.NPWZ,
  regon14: e.P1_REGON14 ?? "00000000000000",
  regon9: e.P1_REGON9 ?? "000000000",
  nfzBranch: e.P1_NFZ_BRANCH ?? "07",
  nfzContract: e.P1_NFZ_CONTRACT ?? "0000000",
  orgUnitExt: e.P1_ORG_UNIT_EXT ?? "000000000000-001",
  musRoot: e.P1_MUS_ROOT ?? OID.MUS,
  musExt: e.P1_MUS_EXT ?? "001",
  doctor: { givenNames: ["Adam"], familyName: "Leczniczy" },
  organizationName: "Poradnia (gabinet) lekarza POZ",
  organizationPhone: "+48221234567",
  organizationAddress: {
    postalCode: "01-797",
    city: "Warszawa",
    street: "Powązkowska",
    houseNumber: "44",
  },
};

/** Pacjent testowy (zarejestrowany w CWUb na środowisku integracyjnym). */
export const patient = {
  pesel: e.P1_PATIENT_PESEL ?? "40010151673",
  givenNames: [e.P1_PATIENT_GIVEN ?? "Sylwester"],
  familyName: e.P1_PATIENT_FAMILY ?? "Senior",
  birthDate: e.P1_PATIENT_BIRTH ?? "19400101",
  gender: (e.P1_PATIENT_GENDER as "M" | "F" | undefined) ?? "M",
  address: {
    city: "Warszawa",
    postalCode: "01-381",
    street: "Powstańców Śląskich",
    houseNumber: "8B",
  },
};

/** Kontekst wywołania (ten sam dla skierowania i recepty - dialekt dobiera transport). */
export const context: CallContext = {
  subject: { root: account.providerRoot, extension: account.podmiotExt },
  user: { root: account.npwzRoot, extension: account.npwz },
  workplace: { root: account.musRoot, extension: account.musExt },
  businessRole: "DOCTOR",
};

/** Endpointy usług P1 (środowisko integracyjne domyślnie). */
export const endpoints = {
  referral: e.P1_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/services/ObslugaSkierowaniaWS",
  prescription: e.P1_RECEPTA_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/services/ObslugaReceptyWS",
} as const;

const certDir =
  e.P1_CERT_DIR ?? resolve(import.meta.dirname, "../.local/certs/Podmiot_leczniczy_713");
const certPassword = e.CERT_PASSWORD ?? e.P1_CERT_PASSWORD ?? "";

/** Zależności transportu (bez endpointu) - wspólne dla skierowań i recept. */
export interface TransportDeps {
  readonly context: CallContext;
  readonly documentSigner: DocumentSigner;
  readonly httpClient: HttpClient;
  readonly wsSecurityCertificate: WsSecurityCertificate;
}

/**
 * Składa transport z certyfikatów w `.local/certs`. Zwraca `undefined`, gdy brakuje
 * certyfikatów/hasła - wtedy przykład pokaże tylko zbudowany dokument (offline).
 */
export function tryBuildTransport(): (TransportDeps & { endpoint: string }) | undefined {
  const tlsP12 = resolve(certDir, "Podmiot_leczniczy_713-tls.p12");
  const signP12 = resolve(certDir, "Adam713 Leczniczy.p12");
  const wssP12 = resolve(certDir, "Podmiot_leczniczy_713-wss.p12");
  if (!certPassword || !existsSync(tlsP12) || !existsSync(signP12) || !existsSync(wssP12)) {
    return undefined;
  }

  const tls = parseP12(readFileSync(tlsP12), certPassword);
  return {
    context,
    documentSigner: createXadesDocumentSigner({
      certificate: { p12: readFileSync(signP12), password: certPassword },
    }),
    httpClient: createNodeHttpClient({ tls: { key: tls.privateKeyPem, cert: tls.certificatePem } }),
    wsSecurityCertificate: parseP12(readFileSync(wssP12), certPassword),
    endpoint: "", // ustawiany per usługa niżej
  };
}

/** Transport dla usługi skierowań (lub `undefined`, gdy brak certów). */
export function referralTransport(): (TransportDeps & { endpoint: string }) | undefined {
  const t = tryBuildTransport();
  return t ? { ...t, endpoint: endpoints.referral } : undefined;
}

/** Transport dla usługi recept (lub `undefined`, gdy brak certów). */
export function prescriptionTransport(): (TransportDeps & { endpoint: string }) | undefined {
  const t = tryBuildTransport();
  return t ? { ...t, endpoint: endpoints.prescription } : undefined;
}

/** Wypisuje fragment zbudowanego dokumentu (do podglądu w przykładach offline). */
export function previewXml(xml: string): void {
  const lines = xml.split("\n");
  console.log("\n- zbudowany dokument CDA (pierwsze 25 linii) -");
  console.log(lines.slice(0, 25).join("\n"));
  console.log(`... (łącznie ${lines.length} linii, ${xml.length} znaków)\n`);
}
