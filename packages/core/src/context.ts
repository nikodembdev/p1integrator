import type { Oid } from "./oid.js";

/**
 * Kontekst wywołania usługi P1 (KontekstMT, kontekst.xsd).
 * Realizowany jako WS-Security custom token: lista atrybutów (nazwa → wartość).
 */

export const CONTEXT_NAMESPACE = "http://csioz.gov.pl/p1/kontekst/mt/v20180509";

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

/** Nazwy atrybutów kontekstu (NazwaAtrybutuKontekstuMT) — klucze wprost z P1. */
export const CONTEXT_ATTR = {
  idPodmiotuOidRoot: "urn:csioz:p1:kontekst:idPodmiotuOidRoot",
  idPodmiotuOidExt: "urn:csioz:p1:kontekst:idPodmiotuOidExt",
  idUzytkownikaOidRoot: "urn:csioz:p1:kontekst:idUzytkownikaOidRoot",
  idUzytkownikaOidExt: "urn:csioz:p1:kontekst:idUzytkownikaOidExt",
  idMiejscaPracyOidRoot: "urn:csioz:p1:kontekst:idMiejscaPracyOidRoot",
  idMiejscaPracyOidExt: "urn:csioz:p1:kontekst:idMiejscaPracyOidExt",
  rolaBiznesowa: "urn:csioz:p1:kontekst:rolaBiznesowa",
  idAsystentaMedycznegoOidRoot: "urn:csioz:p1:kontekst:idAsystentaMedycznegoOidRoot",
  idAsystentaMedycznegoOidExt: "urn:csioz:p1:kontekst:idAsystentaMedycznegoOidExt",
} as const;

/** Wygodny, dziedzinowy widok Kontekstu (zamiast surowej listy atrybutów). */
export interface CallContext {
  /** Podmiot medyczny (idPodmiotu). */
  readonly subject: Oid;
  /** Użytkownik — pracownik medyczny (idUzytkownika). */
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
 */
export function contextToAttributes(context: CallContext): ContextAttribute[] {
  const attributes: ContextAttribute[] = [
    { name: CONTEXT_ATTR.idPodmiotuOidRoot, value: context.subject.root },
    { name: CONTEXT_ATTR.idPodmiotuOidExt, value: context.subject.extension },
    { name: CONTEXT_ATTR.idUzytkownikaOidRoot, value: context.user.root },
    { name: CONTEXT_ATTR.idUzytkownikaOidExt, value: context.user.extension },
    { name: CONTEXT_ATTR.idMiejscaPracyOidRoot, value: context.workplace.root },
    { name: CONTEXT_ATTR.idMiejscaPracyOidExt, value: context.workplace.extension },
    { name: CONTEXT_ATTR.rolaBiznesowa, value: BUSINESS_ROLE[context.businessRole] },
  ];
  if (context.medicalAssistant) {
    attributes.push(
      { name: CONTEXT_ATTR.idAsystentaMedycznegoOidRoot, value: context.medicalAssistant.root },
      { name: CONTEXT_ATTR.idAsystentaMedycznegoOidExt, value: context.medicalAssistant.extension },
    );
  }
  return attributes;
}
