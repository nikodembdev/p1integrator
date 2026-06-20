/**
 * Lokalny walidator skierowań: buduje przykładowy dokument (@p1/referral) i
 * przepuszcza go przez ORYGINALNY walidator Schematron P1 (SEF), raportując
 * naruszenia (SVRL failed-assert).
 *
 * Uruchom: pnpm tsx scripts/validate-referral.ts [health-resort|general]
 * Wymaga skompilowanych SEF w .local/ (xslt3 -xsl:...plCda*.xslt -export:... -nogo).
 */
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error - saxon-js nie dostarcza typów
import SaxonJS from "saxon-js";
import {
  buildCareFacilityReferralCda,
  buildGeneralReferralCda,
  buildHealthResortReferralCda,
  buildLongtermNursingReferralCda,
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
} from "../packages/referral/src/index.js";

const here = dirname(fileURLToPath(import.meta.url));

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

const cases: Record<string, { readonly sef: string; readonly xml: () => string }> = {
  "health-resort": {
    sef: "healthResort.sef.json",
    xml: () => buildHealthResortReferralCda(healthResortInput).xml,
  },
  general: { sef: "general.sef.json", xml: () => buildGeneralReferralCda(generalInput).xml },
  rehabilitation: {
    sef: "rehab.sef.json",
    xml: () => buildRehabilitationReferralCda(rehabilitationInput).xml,
  },
  psychiatric: {
    sef: "psych.sef.json",
    xml: () => buildPsychiatricReferralCda(psychiatricInput).xml,
  },
  "care-facility": {
    sef: "care.sef.json",
    xml: () => buildCareFacilityReferralCda(careFacilityInput).xml,
  },
  "longterm-nursing": {
    sef: "ltn.sef.json",
    xml: () => buildLongtermNursingReferralCda(longtermNursingInput).xml,
  },
  "occupational-disease": {
    sef: "occ.sef.json",
    xml: () => buildOccupationalDiseaseReferralCda(occupationalDiseaseInput).xml,
  },
};

const type = process.argv[2] ?? "health-resort";
const selected = cases[type];
if (!selected) {
  console.error(`Nieznany typ: ${type}. Dostępne: ${Object.keys(cases).join(", ")}`);
  process.exit(1);
}

const SEF = resolve(here, `../.local/${selected.sef}`);
if (!existsSync(SEF)) {
  console.error(`Brak .local/${selected.sef} — skompiluj walidator (xslt3). Pomijam.`);
  process.exit(0);
}

const xml = selected.xml();
const result = SaxonJS.transform(
  { stylesheetFileName: SEF, sourceText: xml, destination: "serialized" },
  "sync",
) as { principalResult: string };

const svrl = result.principalResult;
const violations: { text: string; location: string; role: string }[] = [];
for (const match of svrl.matchAll(
  /<svrl:failed-assert\b([^>]*)>([\s\S]*?)<\/svrl:failed-assert>/g,
)) {
  const attrs = match[1] ?? "";
  const body = match[2] ?? "";
  violations.push({
    location: /location="([^"]*)"/.exec(attrs)?.[1] ?? "",
    role: /role="([^"]*)"/.exec(attrs)?.[1] ?? "error",
    text: (/<svrl:text>([\s\S]*?)<\/svrl:text>/.exec(body)?.[1] ?? "").replace(/\s+/g, " ").trim(),
  });
}

const errors = violations.filter((v) => v.role !== "warning");
console.log(`\nWalidacja Schematron P1 (${type}) — dokument ${xml.length} znaków`);
console.log(`Błędy: ${errors.length}, ostrzeżenia: ${violations.length - errors.length}\n`);
for (const v of errors.slice(0, 40)) {
  console.log(`• ${v.text}`);
  if (v.location) console.log(`    @ ${v.location}`);
}

if (process.env.DUMP) writeFileSync(resolve(here, `../.local/last-${type}.xml`), xml);
process.exit(errors.length > 0 ? 1 : 0);
