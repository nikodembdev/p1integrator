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
  buildGeneralReferralCda,
  buildHealthResortReferralCda,
  type GeneralReferralInput,
  type HealthResortReferralInput,
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

const cases: Record<string, { readonly sef: string; readonly xml: () => string }> = {
  "health-resort": {
    sef: "healthResort.sef.json",
    xml: () => buildHealthResortReferralCda(healthResortInput).xml,
  },
  general: { sef: "general.sef.json", xml: () => buildGeneralReferralCda(generalInput).xml },
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
