import type { Gender, RealizationMode, TreatmentType } from "./constants.js";

/** Obiekt sekcji body w formacie xmlbuilder2 (zawartość elementu `<section>`). */
export type CdaSection = Record<string, unknown>;

/** Adres pacjenta (recordTarget). */
export interface CdaPatientAddress {
  readonly city: string;
  readonly postalCode: string;
  readonly houseNumber: string;
  readonly street?: string;
  readonly unitId?: string;
  readonly country?: string;
  /** Kod użycia adresu, np. "PST", "HP". */
  readonly use?: string;
}

/** Adres organizacji (autora). */
export interface CdaOrgAddress {
  readonly postalCode: string;
  readonly city: string;
  readonly street: string;
  readonly houseNumber: string;
}

export interface CdaPatient {
  readonly pesel: string;
  readonly givenNames: readonly string[];
  readonly familyName: string;
  readonly birthDate: string; // YYYYMMDD
  readonly address: CdaPatientAddress;
  /** Wewnętrzny identyfikator pacjenta u świadczeniodawcy (root <localRoot>.17.1). */
  readonly internalId?: string;
  readonly gender?: Gender;
  readonly phone?: string;
  readonly email?: string;
}

/** Organizacja autora: miejsce pracy → podmiot (REGON 14 → REGON 9) + NFZ. */
export interface CdaAuthorOrganization {
  /** Identyfikator usługodawcy (extension); root podawany w `providerRoot`. */
  readonly providerExt: string;
  readonly providerRoot: string;
  readonly regon14: string;
  readonly regon9: string;
  readonly name: string;
  readonly address: CdaOrgAddress;
  readonly phone?: string;
  /** Kod oddziału NFZ, np. "07". */
  readonly nfzBranchCode: string;
  /** Numer umowy NFZ. */
  readonly nfzContractNumber: string;
}

export interface CdaAuthor {
  /** Identyfikator wystawcy (extension) i jego root. */
  readonly authorExt: string;
  readonly authorRoot: string;
  /** Zawód medyczny (functionCode), np. "LEK". */
  readonly functionCode: string;
  readonly functionDisplay: string;
  readonly specialtyCode: string;
  readonly specialtyDisplay: string;
  readonly prefix?: string; // domyślnie "lek."
  readonly givenNames: readonly string[];
  readonly familyName: string;
  readonly organization: CdaAuthorOrganization;
}

export interface CdaLegalAuthenticator {
  readonly authorExt: string;
  readonly authorRoot: string;
  readonly functionCode: string; // "LEK"
  readonly functionDisplay: string;
}

export interface ClinicalDocumentHeaderInput {
  /** Bazowy root lokalny podmiotu (`id_lokalne_podmiotu`); z niego pochodzą .4.1/.4.2/.17.1. */
  readonly localRoot: string;
  readonly title: string;
  readonly treatmentType: TreatmentType;
  readonly realizationMode: RealizationMode;
  readonly patient: CdaPatient;
  readonly author: CdaAuthor;
  readonly legalAuthenticator: CdaLegalAuthenticator;
  /** Kod oddziału NFZ dla participant (np. "07"). */
  readonly nfzBranchCode: string;

  /** Identyfikator dokumentu (domyślnie generowany). */
  readonly documentId?: string;
  /** Identyfikator zbioru wersji (domyślnie = documentId). */
  readonly documentSetId?: string;
  /** Czas wystawienia; domyślnie `now ?? new Date()`. */
  readonly now?: Date;
  /** Nadpisanie czasu wystawienia (YYYYMMDDHHmmss). */
  readonly documentDate?: string;
  /** Sekcje kliniczne `structuredBody` (obiekty z builderów sekcji). */
  readonly bodyComponents?: readonly CdaSection[];
}

export interface ClinicalDocumentResult {
  readonly xml: string;
  readonly documentId: string;
  readonly documentDate: string;
}
