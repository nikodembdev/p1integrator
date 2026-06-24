/** Stałe e-ZLA (ZUS, kanał gabinetowy V4). */

/**
 * Namespace usługi kanału gabinetowego (targetNamespace z WSDL).
 * UWAGA: przykładowe requesty w dokumentacji używają `http://zus.gov.pl/b2b/...`
 * (gov.pl!) - do zweryfikowania, który przyjmuje symulator. Domyślnie WSDL-owy.
 */
export const ZUS_GABINETOWE_NS = "http://zus.pl/b2b/zus/channel/gabinetowe";
/** Namespace dokumentów KED ZLA. */
export const KED_ZLA_NS = "http://www.zus.pl/2015/KED_ZLA_1";
/** Namespace podpisu XML (XML-DSig). */
export const XMLDSIG_NS = "http://www.w3.org/2000/09/xmldsig#";

/** Endpoint symulatora usług ZUS (środowisko testowe). */
export const SIMULATOR_ENDPOINT = "https://193.105.143.152:8001/ws/zus.channel.gabinetoweV4:zla";
/** Dane HTTP Basic Auth do symulatora (transportowy gate, wspólny dla wszystkich). */
export const SIMULATOR_BASIC_AUTH = { login: "ezla_ag", password: "ezla_ag" } as const;

/** Prefiks SOAPAction binding-u (`{prefix}{nazwaOperacji}`). */
export const SOAP_ACTION_PREFIX = "zus_channel_zla_Binder_";

/** Metoda uwierzytelnienia przy logowaniu podpisem (`zalogujPodpisem`). */
export const AUTH_METHOD = {
  /** Podpis kwalifikowany / certyfikat (osobisty/ZUS). */
  CERTIFICATE: "certyfikat",
  /** Podpis zaufany ePUAP. */
  EPUAP: "ePuap",
} as const;

/** Tryb wystawiania zaświadczeń (`TrybWystawianiaEnumeracja`). */
export const ISSUE_MODE = {
  /** Tryb bieżący (standardowy). */
  CURRENT: "Biezacy",
  /** Tryb alternatywny (gdy bieżący niedostępny). */
  ALTERNATIVE: "Alternatywny",
} as const;

/** Rodzaj dokumentu (`RodzajDokumentuEnumeracja`) - m.in. dla pobierania UPP. */
export const DOCUMENT_KIND = {
  ZLA: "ZLA",
  KOPIA_ZLA: "KOPIA_ZLA",
  /** Anulowanie ZLA. */
  AZLA: "AZLA",
  /** Unieważnienie ZLA. */
  UZLA: "UZLA",
} as const;
