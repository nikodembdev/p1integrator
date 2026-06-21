/**
 * Współdzielone przykładowe dane wejściowe + mapa typów skierowań → builder CDA + plik SEF.
 * Źródło prawdy dla `scripts/validate-referral.ts` oraz testów konformancji
 * (`test/integration/conformance.test.ts`). Dane SYNTETYCZNE — do walidacji
 * Schematron/XSD, nie do realnej wysyłki (do tego służy e2e z danymi z CWUb).
 */
import {
  buildCareFacilityReferralCda,
  buildGeneralReferralCda,
  buildHealthResortReferralCda,
  buildLongtermNursingReferralCda,
  buildNullificationCda,
  buildOccupationalDiseaseReferralCda,
  buildPsychiatricReferralCda,
  buildRehabilitationReferralCda,
  type CareFacilityReferralInput,
  type GeneralReferralInput,
  type HealthResortReferralInput,
  type LongtermNursingReferralInput,
  type OccupationalDiseaseReferralInput,
  type PsychiatricReferralInput,
  type RehabilitationReferralInput,
} from "../../packages/referral/src/index.js";
import {
  buildDrugPrescriptionCda,
  buildPrescriptionCancellationCda,
  type DrugPrescriptionInput,
  type PrescriptionCancellationInput,
} from "../../packages/prescription/src/index.js";

const patient = {
  pesel: "62091512345",
  givenNames: ["Jan", "Franciszek"],
  familyName: "Kowalski",
  birthDate: "19620915",
  gender: "M" as const,
  address: {
    use: "HP",
    city: "Strzelin",
    postalCode: "57-100",
    street: "Mickiewicza",
    houseNumber: "20",
    country: "Polska",
  },
};
const author = {
  authorExt: "1234567",
  authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
  functionCode: "LEK",
  functionDisplay: "Lekarz",
  specialtyCode: "0718_0726",
  specialtyDisplay: "neurologia",
  givenNames: ["Piotr"],
  familyName: "Nowak",
  organization: {
    providerExt: "000000000000-001",
    providerRoot: "2.16.840.1.113883.3.4424.2.3.1",
    regon14: "12345678901234",
    regon9: "123456789",
    name: "Poradnia POZ",
    phone: "22-1111123",
    nfzBranchCode: "07",
    nfzContractNumber: "12345678",
    address: { postalCode: "57-100", city: "Strzelin", street: "Mickiewicza", houseNumber: "20" },
  },
};
const legalAuthenticator = {
  authorExt: "1234567",
  authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
  functionCode: "LEK",
  functionDisplay: "Lekarz",
};
const header = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  nfzBranchCode: "07",
  patient,
  author,
  legalAuthenticator,
};
const diagnoses = {
  main: {
    icd10Code: "I25.2",
    icd10Name: "Stary (przebyty) zawał serca",
    description: "Przebyty zawał mięśnia sercowego",
  },
  secondary: [
    { icd10Code: "I10", icd10Name: "Nadciśnienie pierwotne", description: "Nadciśnienie" },
  ],
};

const healthResortInput: HealthResortReferralInput = {
  ...header,
  title: "Skierowanie na leczenie uzdrowiskowe",
  treatmentType: "LU",
  realizationMode: "TS",
  socialHistory: "Nie dotyczy",
  medicalHistory: { complaints: "Bóle kręgosłupa", previousSpaTreatment: "NIE" },
  physicalExam: {
    vitalSigns: { systolicBP: 140, diastolicBP: 85, weight: 88, height: 190, heartRate: 90 },
    systems: { respiratory: "Wydolny", musculoskeletal: "Ograniczenie ruchomości" },
    selfCareAbility: true,
    contraindicationsForNaturalResources: false,
    justifications: ["PSR", "LPB"],
  },
  diagnoses,
  labResults: [
    { icd9Code: "A01", icd9Name: "Mocz badanie ogólne", date: "20240101" },
    { icd9Code: "C59", icd9Name: "OB", date: "20240101" },
    { icd9Code: "C55", icd9Name: "Morfologia krwi", date: "20240101" },
  ],
  correspondenceMode: "P",
};

const generalInput: GeneralReferralInput = {
  ...header,
  title: "Skierowanie do szpitala",
  diagnoses,
  procedures: {
    place: { code: "4100", name: "Oddział kardiologiczny" },
    procedures: [{ icd9Code: "88.55", icd9Name: "Koronarografia z użyciem jednego cewnika" }],
  },
};

const rehabilitationInput: RehabilitationReferralInput = {
  ...header,
  title: "Skierowanie na rehabilitację leczniczą",
  diagnoses,
  procedures: {
    place: { code: "4100", name: "Oddział rehabilitacji" },
    procedures: [{ icd9Code: "93.11", icd9Name: "Ćwiczenia czynne wolne" }],
  },
  contraindications: "Brak przeciwwskazań do rehabilitacji leczniczej",
};

const psychiatricInput: PsychiatricReferralInput = {
  ...header,
  patient: { ...patient, birthplace: { city: "Wrocław", postalCode: "50-001", country: "Polska" } },
  title: "Skierowanie do szpitala psychiatrycznego",
  socialHistory: "Mieszka sam, bez wsparcia rodziny",
  diagnoses,
  encounter: { cellCode: "2700", cellName: "Oddział dzienny psychiatryczny (ogólny)" },
  reasonForReferral: "Pogorszenie stanu psychicznego, konieczność hospitalizacji",
};

const careFacilityInput: CareFacilityReferralInput = {
  ...header,
  patient: { ...patient, phone: "48-71-1234567" },
  title: "Skierowanie do zakładu pielęgnacyjno-opiekuńczego",
  currentMedication: "Leczenie przeciwbólowe i przeciwzakrzepowe",
  barthelScore: "40 punktów — pacjent wymaga znacznej pomocy",
  encounter: {
    cellCode: "5160",
    cellName: "Zakład/Oddział pielęgnacyjno-opiekuńczy",
    priority: "R",
  },
  annotation: "Pacjent po udarze, wymaga całodobowej opieki pielęgniarskiej",
};

const longtermNursingInput: LongtermNursingReferralInput = {
  ...header,
  title: "Skierowanie na objęcie pielęgniarską opieką długoterminową",
  history: "Pacjent unieruchomiony po udarze, wymaga stałej opieki pielęgniarskiej",
  physicalFindings: "Niedowład połowiczy prawostronny, odleżyna okolicy krzyżowej",
  encounter: { cellCode: "2142", cellName: "Pielęgniarska opieka długoterminowa" },
};

const occupationalDiseaseInput: OccupationalDiseaseReferralInput = {
  ...header,
  title: "Skierowanie na badanie w związku z podejrzeniem choroby zawodowej",
  occupationHistory: "Spawacz, 20 lat pracy w narażeniu na dymy spawalnicze",
  diagnosis: {
    code: "21",
    name: "Przewlekłe obturacyjne zapalenie oskrzeli",
    description: "Podejrzenie pylicy / POChP zawodowej",
  },
  occupationalExposure: "Dymy spawalnicze, pyły metali, narażenie przewlekłe",
};

const nullificationInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  patient: {
    pesel: "62091512345",
    internalId: "12345",
    givenNames: ["Jan"],
    familyName: "Kowalski",
  },
  author: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
    givenNames: ["Piotr"],
    familyName: "Nowak",
  },
  legalAuthenticator: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
  },
  annulledDocument: {
    idRoot: "2.16.840.1.113883.3.4424.2.7.999.4.1",
    idExtension: "9999999999999999999999",
    versionNumber: 1,
  },
  description: "Anulowanie skierowania z powodu błędnych danych pacjenta",
};

export interface ReferralCase {
  /** Nazwa typu (argument CLI / nazwa testu). */
  readonly name: string;
  /** Plik SEF (skompilowany Schematron) w `.local/`. */
  readonly sef: string;
  /** Builduje CDA tego typu. */
  readonly build: () => string;
}

export const referralCases: readonly ReferralCase[] = [
  {
    name: "health-resort",
    sef: "healthResort.sef.json",
    build: () => buildHealthResortReferralCda(healthResortInput).xml,
  },
  {
    name: "general",
    sef: "general.sef.json",
    build: () => buildGeneralReferralCda(generalInput).xml,
  },
  {
    name: "rehabilitation",
    sef: "rehab.sef.json",
    build: () => buildRehabilitationReferralCda(rehabilitationInput).xml,
  },
  {
    name: "psychiatric",
    sef: "psych.sef.json",
    build: () => buildPsychiatricReferralCda(psychiatricInput).xml,
  },
  {
    name: "care-facility",
    sef: "care.sef.json",
    build: () => buildCareFacilityReferralCda(careFacilityInput).xml,
  },
  {
    name: "longterm-nursing",
    sef: "ltn.sef.json",
    build: () => buildLongtermNursingReferralCda(longtermNursingInput).xml,
  },
  {
    name: "occupational-disease",
    sef: "occ.sef.json",
    build: () => buildOccupationalDiseaseReferralCda(occupationalDiseaseInput).xml,
  },
  {
    name: "nullification",
    sef: "null.sef.json",
    build: () => buildNullificationCda(nullificationInput).xml,
  },
];

const drugPrescriptionInput: DrugPrescriptionInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.1491",
  prescriptionNumber: "00000000000000000001",
  versionSetId: { root: "2.16.840.1.113883.3.4424.2.7.17.2.2", extension: "1" },
  effectiveDate: "20260619",
  patient: {
    pesel: "40010151673",
    internalId: "12345",
    givenNames: ["Sylwester"],
    familyName: "Senior",
    gender: "M",
    birthDate: "19400101",
    address: {
      postalCode: "03-134",
      postCity: "Warszawa",
      city: "Warszawa",
      street: "Odkryta",
      houseNumber: "41",
      unitId: "12",
    },
  },
  author: {
    npwz: "4727124",
    givenNames: ["Adam"],
    familyName: "Leczniczy",
    organization: {
      podmiotExt: "000000927722",
      regon14: "23706493000004",
      name: "Poradnia POZ",
      phone: "22-1111123",
      address: { postalCode: "00-184", city: "Warszawa", street: "Odkryta", houseNumber: "41" },
    },
  },
  legalAuthenticator: { npwz: "4727124" },
  drug: {
    code: "100000126",
    name: "Zofran",
    packageEan: "05909990805617",
    packageName: "Zofran",
    formCode: "30066000",
    formName: "Tablet container",
    capacityUnit: "tabl.",
    capacityValue: "24",
    strengthText: "5 g / 50 ml + 20 mg",
    ingredients: [
      {
        numeratorValue: "5",
        numeratorUnit: "g",
        denominatorValue: "50",
        denominatorUnit: "ml",
        code: "23432",
        name: "Enalaprili maleas",
      },
      {
        numeratorValue: "20",
        numeratorUnit: "mg",
        denominatorValue: "1",
        code: "34543",
        name: "Hydrochlorothiazidum",
      },
    ],
  },
  dosage: {
    text: "3 x dziennie po 1 szt., zakończyć do 14 października 2026 r.",
    startDate: "20260619",
    endDate: "20261014",
    periodUnit: "h",
    periodValue: "8",
    repeatNumber: "1",
    doseQuantity: "1",
    rateUnit: "1",
    rateValue: "2",
  },
  payment: { nfzBranch: "07", level: "100%", packageCount: "4" },
  substitution: false,
  dispenserInfo: "Brak",
};

const prescriptionCancellationInput: PrescriptionCancellationInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.1491",
  cancellationNumber: "AA11BB22CC33DD44EE55FF",
  effectiveDate: "20260619120000",
  cancelled: {
    prescriptionNumber: "00000000000000000001",
    versionSetId: { root: "2.16.840.1.113883.3.4424.2.7.1491.2.2", extension: "ZBIOR1" },
    title: "Recepta",
    issuedDate: "19.06.2026",
  },
  patient: drugPrescriptionInput.patient,
  author: drugPrescriptionInput.author,
  authorSpecialtyCode: "0718",
  authorSpecialtyName: "neurologia",
  legalAuthenticator: { npwz: "4727124" },
  nfzBranch: "07",
};

export const prescriptionCases: readonly ReferralCase[] = [
  {
    name: "drug-prescription",
    sef: "p1-docs/recepta/specyfikacje/schematron/schematron/1.3.2/plcda-schematron-DrugPrescription/plcda-plCdaDrugPrescription.sef.json",
    build: () => buildDrugPrescriptionCda(drugPrescriptionInput).xml,
  },
  {
    name: "drug-cancellation",
    sef: "p1-docs/recepta/specyfikacje/schematron/schematron/1.3.2/plcda-schematron-Nullification/plcda-plCdaNullification.sef.json",
    build: () => buildPrescriptionCancellationCda(prescriptionCancellationInput).xml,
  },
];
