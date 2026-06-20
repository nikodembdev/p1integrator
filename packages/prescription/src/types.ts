/** Typy wejściowe recepty na lek (e-recepta). */

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
  /** id_podmiotu — numer księgi rejestrowej (root .2.3.1 / .2.3.2). */
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
  organization: PrescriptionOrganization;
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
  /** Kategoria dostępności (KDLEK): Rp/Rpw/Rpz/OTC… (domyślnie Rp). */
  availabilityCategory?: string;
  /** EAN opakowania (GS1). */
  packageEan: string;
  packageName: string;
  /** Postać farmaceutyczna (codeSystem .16.1.1.2.1). */
  formCode: string;
  formName: string;
  capacityUnit: string;
  capacityValue: string;
  /** Moc/skład — tekst do narrative (np. „5 g / 50 ml + 20 mg"). */
  strengthText?: string;
  ingredients: PrescriptionIngredient[];
}

export interface PrescriptionDosage {
  /** Treść D.S. (sposób stosowania). */
  text: string;
  /** YYYYMMDD — początek/koniec stosowania (effectiveTime IVL_TS). */
  startDate?: string;
  endDate?: string;
  /** Częstotliwość (effectiveTime PIVL_TS, operator A). */
  periodUnit?: string;
  periodValue?: string;
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
  /** Poziom odpłatności (value, np. „100%"/"50%"/"R"/"B"). */
  level: string;
  levelDisplay?: string;
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
  payment: PrescriptionPayment;
  /** Czy zamiana dozwolona (domyślnie true). false → „NZ" + akt zakazu zamiany. */
  substitution?: boolean;
  /** Informacja dla osoby wydającej lek (narrative). */
  dispenserInfo?: string;
}

export interface DrugPrescriptionResult {
  xml: string;
  prescriptionNumber: string;
  effectiveDate: string;
}
