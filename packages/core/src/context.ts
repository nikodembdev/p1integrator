import type { Oid } from "./oid.js";

/**
 * Kontekst wywołania usługi P1 (KontekstMT, kontekst.xsd).
 * Realizowany jako WS-Security custom token: lista atrybutów (nazwa → wartość).
 */

export const CONTEXT_NAMESPACE = "http://csioz.gov.pl/p1/kontekst/mt/v20180509";

/**
 * Domyślny prefiks URN nazw atrybutów kontekstu (e-skierowanie). Inne usługi P1
 * używają własnego prefiksu (np. e-recepta: `urn:csioz:p1:erecepta:kontekst:`) -
 * patrz `contextToAttributes(context, urnPrefix)`.
 */
export const CONTEXT_URN_PREFIX = "urn:csioz:p1:kontekst:";

/**
 * Rola biznesowa: angielski klucz (publiczne API) → wartość atrybutu
 * `rolaBiznesowa` wprost z P1 (wire). Użytkownik posługuje się kluczem.
 */
export const BUSINESS_ROLE = {
  DOCTOR: "LEKARZ_LEK_DENTYSTA_FELCZER",
  NURSE_MIDWIFE: "PIELEGNIARKA_POLOZNA",
  PHARMACIST: "FARMACEUTA",
  PHARMACY_TECHNICIAN: "TECHNIK_FARMACEUTYCZNY",
  LAB_DIAGNOSTICIAN: "DIAGNOSTA_LABORATORYJNY",
  PHYSIOTHERAPIST: "FIZJOTERAPEUTA",
  OTHER_MEDICAL_PROFESSIONAL: "INNY_PROFESJONALISTA_MEDYCZNY",
  ADMINISTRATIVE_STAFF: "PRACOWNIK_ADMINISTRACYJNY",
  PATIENT: "USLUGOBIORCA",
  PROXY: "PELNOMOCNIK",
  GUARDIAN: "OPIEKUN",
} as const;
export type BusinessRole = keyof typeof BUSINESS_ROLE;

/** Sufiksy nazw atrybutów kontekstu (NazwaAtrybutuKontekstuMT) - bez prefiksu URN. */
const CONTEXT_ATTR_SUFFIX = {
  idPodmiotuOidRoot: "idPodmiotuOidRoot",
  idPodmiotuOidExt: "idPodmiotuOidExt",
  idUzytkownikaOidRoot: "idUzytkownikaOidRoot",
  idUzytkownikaOidExt: "idUzytkownikaOidExt",
  idMiejscaPracyOidRoot: "idMiejscaPracyOidRoot",
  idMiejscaPracyOidExt: "idMiejscaPracyOidExt",
  rolaBiznesowa: "rolaBiznesowa",
  idAsystentaMedycznegoOidRoot: "idAsystentaMedycznegoOidRoot",
  idAsystentaMedycznegoOidExt: "idAsystentaMedycznegoOidExt",
} as const;

/** Pełne nazwy atrybutów kontekstu z domyślnym prefiksem (e-skierowanie). */
export const CONTEXT_ATTR = Object.fromEntries(
  Object.entries(CONTEXT_ATTR_SUFFIX).map(([key, suffix]) => [
    key,
    `${CONTEXT_URN_PREFIX}${suffix}`,
  ]),
) as Record<keyof typeof CONTEXT_ATTR_SUFFIX, string>;

/** Wygodny, dziedzinowy widok Kontekstu (zamiast surowej listy atrybutów). */
export interface CallContext {
  /** Podmiot medyczny (idPodmiotu). */
  readonly subject: Oid;
  /** Użytkownik - pracownik medyczny (idUzytkownika). */
  readonly user: Oid;
  /** Miejsce pracy (idMiejscaPracy). */
  readonly workplace: Oid;
  /** Rola biznesowa wywołującego. */
  readonly businessRole: BusinessRole;
  /** Asystent medyczny (opcjonalnie). */
  readonly medicalAssistant?: Oid;
}

export interface ContextAttribute {
  readonly name: string;
  readonly value: string;
}

/**
 * Spłaszcza dziedzinowy Kontekst do listy atrybutów (nazwa → wartość),
 * gotowej do serializacji w nagłówku WS-Security przez `@p1/transport`.
 * `urnPrefix` pozwala wybrać dialekt URN usługi (domyślnie e-skierowanie;
 * e-recepta używa `urn:csioz:p1:erecepta:kontekst:`).
 */
export function contextToAttributes(
  context: CallContext,
  urnPrefix: string = CONTEXT_URN_PREFIX,
): ContextAttribute[] {
  const name = (suffix: string): string => `${urnPrefix}${suffix}`;
  const attributes: ContextAttribute[] = [
    { name: name(CONTEXT_ATTR_SUFFIX.idPodmiotuOidRoot), value: context.subject.root },
    { name: name(CONTEXT_ATTR_SUFFIX.idPodmiotuOidExt), value: context.subject.extension },
    { name: name(CONTEXT_ATTR_SUFFIX.idUzytkownikaOidRoot), value: context.user.root },
    { name: name(CONTEXT_ATTR_SUFFIX.idUzytkownikaOidExt), value: context.user.extension },
    { name: name(CONTEXT_ATTR_SUFFIX.idMiejscaPracyOidRoot), value: context.workplace.root },
    { name: name(CONTEXT_ATTR_SUFFIX.idMiejscaPracyOidExt), value: context.workplace.extension },
    { name: name(CONTEXT_ATTR_SUFFIX.rolaBiznesowa), value: BUSINESS_ROLE[context.businessRole] },
  ];
  if (context.medicalAssistant) {
    attributes.push(
      {
        name: name(CONTEXT_ATTR_SUFFIX.idAsystentaMedycznegoOidRoot),
        value: context.medicalAssistant.root,
      },
      {
        name: name(CONTEXT_ATTR_SUFFIX.idAsystentaMedycznegoOidExt),
        value: context.medicalAssistant.extension,
      },
    );
  }
  return attributes;
}
