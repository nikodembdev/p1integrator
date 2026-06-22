/** Typy wejściowe recepty na lek (e-recepta). */

/** Poziom odpłatności za lek (PoziomOdplatnosciZaLeki). */
export type PaymentLevel = "B" | "R" | "30%" | "50%" | "100%";

/** Kategoria dostępności leku (KDLEK). */
export type DrugAvailability = "Rp" | "Rpw" | "Rpz" | "OTC";

/** Uprawnienie dodatkowe publicznego ubezpieczenia zdrowotnego (RLUD). */
export type AdditionalEntitlement =
  | "AZ"
  | "BW"
  | "CN"
  | "DN"
  | "IB"
  | "IN"
  | "IW"
  | "PO"
  | "WP"
  | "ZK"
  | "S"
  | "C"
  | "WE"
  | "DZ";

/** Uprawnienie dodatkowe pacjenta (sekcja „Dane o ubezpieczeniu i uprawnieniach"). */
export interface PrescriptionEntitlement {
  code: AdditionalEntitlement;
  /** Dokument potwierdzający uprawnienie (np. „Nr leg.: 234/1992"). */
  document?: string;
}

export interface PrescriptionAddress {
  country?: string;
  postalCode: string;
  postCity?: string;
  city: string;
  street?: string;
  houseNumber: string;
  unitId?: string;
  censusTract?: string;
  use?: string;
}

export interface PrescriptionPatient {
  pesel: string;
  /** Wewnętrzny identyfikator usługobiorcy (displayable=false). */
  internalId?: string;
  givenNames: string[];
  familyName: string;
  gender?: "M" | "F" | "UN";
  /** YYYYMMDD */
  birthDate: string;
  address: PrescriptionAddress;
}

export interface PrescriptionOrganization {
  /** id_podmiotu - numer księgi rejestrowej (root .2.3.1 / .2.3.2). */
  podmiotExt: string;
  regon14: string;
  name: string;
  phone: string;
  address: { postalCode: string; city: string; street: string; houseNumber: string };
}

export interface PrescriptionAuthor {
  /** Numer prawa wykonywania zawodu. */
  npwz: string;
  givenNames: string[];
  familyName: string;
  prefix?: string;
  /** YYYYMMDD; domyślnie data wystawienia. */
  time?: string;
  /** Organizacja (podmiot) - wymagana dla recepty zwykłej (ZW). */
  organization?: PrescriptionOrganization;
  /** Adres autora - wymagany dla recepty pro auctore / pro familiae. */
  address?: { postalCode: string; city: string; street?: string; houseNumber: string };
  /** Telefon autora - wymagany dla recepty pro auctore / pro familiae. */
  phone?: string;
}

/** Rodzaj recepty elektronicznej: zwykła / pro auctore / pro familiae. */
export type PrescriptionType = "ZW" | "PA" | "PF";

/** Całkowita dawka substancji czynnej (wymagana dla leku Rpw). */
export interface TotalActiveSubstanceDose {
  /** Kod substancji czynnej (jak w pharm:code; w przykładach P1 GS1). */
  code: string;
  name?: string;
  numeratorValue: string;
  numeratorUnit: string;
  denominatorValue: string;
  denominatorUnit?: string;
}

export interface PrescriptionLegalAuthenticator {
  npwz: string;
  /** YYYYMMDD; domyślnie data wystawienia. */
  time?: string;
}

export interface PrescriptionIngredient {
  numeratorValue: string;
  numeratorUnit: string;
  denominatorValue: string;
  denominatorUnit?: string;
  /** Kod substancji czynnej (codeSystem .6.3). */
  code: string;
  name: string;
}

export interface PrescriptionDrug {
  /** Kod leku (manufacturedMaterial, codeSystem .6.1). */
  code: string;
  name: string;
  /** Kategoria dostępności (KDLEK): Rp/Rpw/Rpz/OTC (domyślnie Rp). */
  availabilityCategory?: DrugAvailability;
  /** EAN opakowania (GS1). */
  packageEan: string;
  packageName: string;
  /** Postać farmaceutyczna (codeSystem .16.1.1.2.1). */
  formCode: string;
  formName: string;
  capacityUnit: string;
  capacityValue: string;
  /**
   * Opakowanie zbiorcze (pharm:asSuperContent) - WYMAGANE dla recepty rocznej
   * (recepta365, gdy podano `dosage.treatmentDuration`). Opisuje opakowanie nadrzędne
   * (np. pudełko zawierające N opakowań jednostkowych).
   */
  outerPackage?: {
    name?: string;
    /** Postać opakowania zewnętrznego (EDQM, np. „30009000" = Pudełko). */
    formCode: string;
    formName?: string;
    /**
     * Jednostka pojemności opakowania zewnętrznego (np. „butelka", „słoik").
     * Pomijana dla pojedynczego pudełka mieszczącego jeden pojemnik (capacityValue „1").
     */
    capacityUnit?: string;
    /** Liczba pojemników jednostkowych w opakowaniu zewnętrznym (zwykle „1"). */
    capacityValue: string;
  };
  /** Moc/skład - tekst do narrative (np. „5 g / 50 ml + 20 mg"). */
  strengthText?: string;
  ingredients: PrescriptionIngredient[];
  /** Całkowita dawka substancji czynnej - wymagana dla leku Rpw (kategoria Rpw). */
  totalActiveSubstance?: TotalActiveSubstanceDose;
}

export interface PrescriptionDosage {
  /**
   * Treść D.S. (sposób stosowania) - opcjonalna. Narrację dawkowania builder wylicza
   * ze struktury (period/dawka/daty), więc zwykle nie trzeba jej podawać.
   */
  text?: string;
  /** YYYYMMDD - początek/koniec stosowania (effectiveTime IVL_TS). */
  startDate?: string;
  endDate?: string;
  /** Częstotliwość (effectiveTime PIVL_TS, operator A). */
  periodUnit?: string;
  periodValue?: string;
  /**
   * Czas trwania kuracji (effectiveTime IVL_TS `width`) - dla recepty rocznej (recepta365).
   * Np. `{ value: "365", unit: "d" }`. Jednostka domyślnie „d".
   */
  treatmentDuration?: { value: string; unit?: string };
  repeatNumber?: string;
  doseQuantity?: string;
  /** Jednostka dawki (np. „tabl."); brak → „szt." w narracji. */
  doseUnit?: string;
  rateUnit?: string;
  rateValue?: string;
}

export interface PrescriptionPayment {
  /** Oddział NFZ (id, root .3.1). */
  nfzBranch: string;
  /** Poziom odpłatności (B/R/30%/50%/100%); displayName uzupełniany automatycznie. */
  level: PaymentLevel;
  /** Ilość opakowań (supply/quantity). */
  packageCount: string;
}

export interface DrugPrescriptionInput {
  /** Węzeł OID usługodawcy (id_lokalne_podmiotu). */
  localRoot: string;
  /** Numer recepty (id @extension). */
  prescriptionNumber: string;
  /** Identyfikator zbioru wersji (setId). */
  versionSetId: { root: string; extension: string };
  versionNumber?: number;
  /** Rodzaj recepty elektronicznej (domyślnie ZW). PA/PF → tryb pro auctore/familiae. */
  prescriptionType?: PrescriptionType;
  /** Data wystawienia YYYYMMDD (domyślnie dziś). */
  effectiveDate?: string;
  now?: Date;
  /** @extension sekcji Rp (domyślnie „1"). */
  sectionId?: string;
  patient: PrescriptionPatient;
  author: PrescriptionAuthor;
  legalAuthenticator: PrescriptionLegalAuthenticator;
  drug: PrescriptionDrug;
  dosage: PrescriptionDosage;
  /**
   * Odpłatność (zawsze wymagana przez P1). Lek pełnopłatny = `level: "100%"`
   * (REG.WER.3222: dokument musi mieć poziom odpłatności).
   */
  payment: PrescriptionPayment;
  /**
   * Uprawnienia dodatkowe pacjenta (sekcja .3.69) - np. S (senior), C (ciąża),
   * IB (inwalida wojenny). Generują dodatkową sekcję „Dane o ubezpieczeniu i uprawnieniach".
   */
  entitlements?: readonly PrescriptionEntitlement[];
  /** Czy zamiana dozwolona (domyślnie true). false → „NZ" + akt zakazu zamiany. */
  substitution?: boolean;
  /** Informacja dla osoby wydającej lek (narrative). */
  dispenserInfo?: string;
  /**
   * Data końca okna realizacji (YYYYMMDD lub pełny TS) - recepta roczna (recepta365).
   * Ustawia supply `effectiveTime` IVL_TS: low = data wystawienia, high = ta data
   * (do 365 dni od wystawienia). Wymaga też `dosage.treatmentDuration`.
   */
  realizationEndDate?: string;
}

export interface DrugPrescriptionResult {
  xml: string;
  prescriptionNumber: string;
  effectiveDate: string;
}
