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

const ENV_FILE = process.env.P1_ENV_FILE
  ? resolve(process.cwd(), process.env.P1_ENV_FILE)
  : resolve(import.meta.dirname, "../.local/p1.env");
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
  // Imię/nazwisko lekarza. Dla zdarzeń medycznych musi zgadzać się z CWPM po NPWZ
  // (REG.WER.4059) - jeśli konto testowe ma inną nazwę, ustaw P1_DOCTOR_GIVEN/FAMILY.
  doctor: {
    givenNames: [e.P1_DOCTOR_GIVEN ?? "Adam"],
    familyName: e.P1_DOCTOR_FAMILY ?? "Leczniczy",
  },
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
  ipom:
    e.P1_IPOM_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/services/ObslugaPlanowOpiekiMedycznejWS",
  // Zdarzenia medyczne: REST/FHIR + OAuth2 (inny host i stack niż SOAP wyżej).
  zmToken: e.P1_ZM_TOKEN_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/token",
  zmFhir: e.P1_ZM_FHIR_URL ?? "https://isus.ezdrowie.gov.pl/fhir",
  // Patient Summary (Karta Pacjenta): REST + OAuth2 (ten sam token co ZM, scope patient-summary).
  // Środowisko integracyjne P1 = isus; dokumentacja SGP wskazuje też tsus/t2sus (inny host, nieosiągalny stąd).
  patientSummary: e.P1_PS_BASE_URL ?? "https://isus.ezdrowie.gov.pl",
  patientSummaryToken: e.P1_PS_TOKEN_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/token",
  // EDM (IHE XDS.b): token SAML + operacje rejestru/repozytorium.
  edmToken:
    e.P1_EDM_TOKEN_ENDPOINT ??
    "https://isus.ezdrowie.gov.pl/services/ObslugaGenerowanieTokenuSamlWS",
  edmIti42: e.P1_EDM_ITI42_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/services/ObslugaEdmIti42WS",
  edmIti18: e.P1_EDM_ITI18_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/services/ObslugaEdmIti18WS",
  edmIti57: e.P1_EDM_ITI57_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/services/ObslugaEdmIti57WS",
  edmSzar:
    e.P1_EDM_SZAR_ENDPOINT ??
    "https://isus.ezdrowie.gov.pl/services/ObslugaRejestrowanieDanychDostepowychWS",
  edmSoz:
    e.P1_EDM_SOZ_ENDPOINT ??
    "https://isus.ezdrowie.gov.pl/services/ObslugaWeryfikacjiDostepuDoDanychWS",
} as const;

/** OID-y EDM używane w przykładach. */
export const EDM_OID = {
  pesel: "2.16.840.1.113883.3.4424.1.1.616",
  /** Węzeł identyfikatora zdarzenia medycznego (MedicalEventId) dla podmiotu. */
  medicalEvent: (podmiotExt: string) => `2.16.840.1.113883.3.4424.2.7.${podmiotExt}.15.1`,
} as const;

const certDir =
  e.P1_CERT_DIR ?? resolve(import.meta.dirname, "../.local/certs/Podmiot_leczniczy_713");
const certPassword = e.CERT_PASSWORD ?? e.P1_CERT_PASSWORD ?? "";

// Ścieżki do konkretnych plików certów — nadpisują logikę certDir+nazwy.
// Przydatne gdy certyf. nie pasują do konwencji nazw (np. środowisko PROD).
const tlsP12Path = e.P1_TLS_P12 ?? resolve(certDir, "Podmiot_leczniczy_713-tls.p12");
const wssP12Path = e.P1_WSS_P12 ?? resolve(certDir, "Podmiot_leczniczy_713-wss.p12");
const signP12Path = e.P1_SIGN_P12 ?? resolve(certDir, "Adam713 Leczniczy.p12");
const signP12Password = e.P1_SIGN_PASSWORD ?? certPassword;

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
  if (
    !certPassword ||
    !existsSync(tlsP12Path) ||
    !existsSync(signP12Path) ||
    !existsSync(wssP12Path)
  ) {
    return undefined;
  }

  const tls = parseP12(readFileSync(tlsP12Path), certPassword);
  return {
    context,
    documentSigner: createXadesDocumentSigner({
      certificate: { p12: readFileSync(signP12Path), password: signP12Password },
    }),
    httpClient: createNodeHttpClient({ tls: { key: tls.privateKeyPem, cert: tls.certificatePem } }),
    wsSecurityCertificate: parseP12(readFileSync(wssP12Path), certPassword),
    endpoint: "",
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

/** Transport dla usługi planów opieki medycznej / IPOM (lub `undefined`, gdy brak certów). */
export function ipomTransport(): (TransportDeps & { endpoint: string }) | undefined {
  const t = tryBuildTransport();
  return t ? { ...t, endpoint: endpoints.ipom } : undefined;
}

/** Zależności zdarzeń medycznych (FHIR/OAuth2): cert WSS do JWT/podpisu + klient mTLS. */
export interface ZmDeps {
  /** Klucz prywatny certu WSS - do podpisu assertion JWT i podpisu XAdES autentyczności. */
  readonly privateKeyPem: string;
  /** Certyfikat WSS (PEM) - do KeyInfo/SigningCertificate w podpisie autentyczności. */
  readonly certificatePem: string;
  /** Klient HTTP z mTLS (cert TLS). */
  readonly httpClient: HttpClient;
  readonly tokenEndpoint: string;
  readonly fhirBaseUrl: string;
}

/**
 * Składa zależności dla zdarzeń medycznych z certyfikatów w `.local/certs`.
 * Zwraca `undefined`, gdy brak certów/hasła (zdarzenie wymaga sieci - bez certów pomijamy).
 */
export function zmTransport(): ZmDeps | undefined {
  if (!certPassword || !existsSync(tlsP12Path) || !existsSync(wssP12Path)) {
    return undefined;
  }
  const tls = parseP12(readFileSync(tlsP12Path), certPassword);
  const wss = parseP12(readFileSync(wssP12Path), certPassword);
  return {
    privateKeyPem: wss.privateKeyPem,
    certificatePem: wss.certificatePem,
    httpClient: createNodeHttpClient({ tls: { key: tls.privateKeyPem, cert: tls.certificatePem } }),
    tokenEndpoint: endpoints.zmToken,
    fhirBaseUrl: endpoints.zmFhir,
  };
}

/** Zależności EDM: cert WSS (token SAML + podpis WS-Security) + klient mTLS. */
export interface EdmDeps {
  /** Certyfikat WSS (do tokenu SAML i podpisu operacji EDM). */
  readonly wsSecurityCertificate: WsSecurityCertificate;
  /** Klient HTTP z mTLS. */
  readonly httpClient: HttpClient;
  /** Klucz/cert TLS (PEM) - do audytu ATNA (ITI-20, syslog over TLS). */
  readonly tlsKeyPem: string;
  readonly tlsCertPem: string;
}

/**
 * Kontekst EDM: jak zwykły, ale miejsce udzielania świadczeń (komórka .2.3.3) ma
 * extension w formacie `{podmiot}-{mus}` (wymóg tokenu SAML EDM).
 */
export const edmContext: CallContext = {
  subject: { root: account.providerRoot, extension: account.podmiotExt },
  user: { root: account.npwzRoot, extension: account.npwz },
  workplace: { root: account.musRoot, extension: `${account.podmiotExt}-${account.musExt}` },
  businessRole: "DOCTOR",
};

/** Pacjent jako identyfikator CX domeny XDS (PESEL). */
export const edmPatientCx = `${patient.pesel}^^^&${EDM_OID.pesel}&ISO`;

/**
 * Składa zależności EDM z certyfikatów w `.local/certs`. Zwraca `undefined`,
 * gdy brak certów/hasła (operacje EDM wymagają sieci).
 */
export function edmTransport(): EdmDeps | undefined {
  if (!certPassword || !existsSync(tlsP12Path) || !existsSync(wssP12Path)) {
    return undefined;
  }
  const tls = parseP12(readFileSync(tlsP12Path), certPassword);
  return {
    wsSecurityCertificate: parseP12(readFileSync(wssP12Path), certPassword),
    httpClient: createNodeHttpClient({ tls: { key: tls.privateKeyPem, cert: tls.certificatePem } }),
    tlsKeyPem: tls.privateKeyPem,
    tlsCertPem: tls.certificatePem,
  };
}

/** Wypisuje fragment zbudowanego dokumentu (do podglądu w przykładach offline). */
export function previewXml(xml: string): void {
  const lines = xml.split("\n");
  console.log("\n- zbudowany dokument CDA (pierwsze 25 linii) -");
  console.log(lines.slice(0, 25).join("\n"));
  console.log(`... (łącznie ${lines.length} linii, ${xml.length} znaków)\n`);
}
