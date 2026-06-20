import type { Gender } from "./oids.js";

/** Obiekt XML w formacie xmlbuilder2 (atrybuty z prefiksem `@`, tekst pod `#`). */
export type XmlObject = Record<string, unknown>;

/** Sekcja body — obiekt zawartości elementu `<section>`, budowany w module domenowym. */
export type CdaSection = XmlObject;

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

/** Miejsce urodzenia pacjenta (recordTarget/birthplace) — wymagane przez część typów (np. psychiatryczny). */
export interface CdaBirthplace {
  readonly city?: string;
  readonly postalCode?: string;
  readonly country?: string;
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
  /** Miejsce urodzenia — emitowane jako `birthplace/place/addr`, gdy podane. */
  readonly birthplace?: CdaBirthplace;
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
  /** Telefon organizacji — wymagany przez Schematron P1 (telecom min 1x). */
  readonly phone: string;
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

/** Wejście generycznego buildera dokumentu CDA (część specyficzna: templateId/code/sekcje). */
export interface ClinicalDocumentInput {
  /** Bazowy root lokalny podmiotu (`id_lokalne_podmiotu`); z niego pochodzą .4.1/.4.2/.17.1. */
  readonly localRoot: string;
  /** Szablon dokumentu (specyficzny dla typu). */
  readonly templateId: { readonly root: string; readonly extension?: string };
  /** Element `<code>` dokumentu (obiekt xmlbuilder2) — specyficzny dla typu. */
  readonly code: XmlObject;
  readonly title: string;
  readonly patient: CdaPatient;
  readonly author: CdaAuthor;
  readonly legalAuthenticator: CdaLegalAuthenticator;
  /** Kod oddziału NFZ dla participant (np. "07"). */
  readonly nfzBranchCode: string;
  /** Sekcje kliniczne `structuredBody` (obiekty z builderów sekcji). */
  readonly sections?: readonly CdaSection[];
  /** Szablon komponentu `structuredBody` (różny per typ dokumentu; domyślnie 2.35). */
  readonly structuredBodyTemplateId?: string;
  /** Szablon recordTarget (różny per typ dokumentu; domyślnie 2.26). */
  readonly recordTargetTemplateId?: string;

  /** Identyfikator dokumentu (domyślnie generowany). */
  readonly documentId?: string;
  /** Identyfikator zbioru wersji (domyślnie = documentId). */
  readonly documentSetId?: string;
  /** Czas wystawienia; domyślnie `now ?? new Date()`. */
  readonly now?: Date;
  /** Nadpisanie czasu wystawienia (YYYYMMDDHHmmss). */
  readonly documentDate?: string;
}

export interface ClinicalDocumentResult {
  readonly xml: string;
  readonly documentId: string;
  readonly documentDate: string;
}
