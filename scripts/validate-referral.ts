/**
 * Lokalny walidator: buduje przykładowe skierowanie uzdrowiskowe (@p1/cda),
 * przepuszcza je przez ORYGINALNY walidator Schematron P1 (skompilowany do SEF)
 * i raportuje naruszenia (SVRL failed-assert). Wymaga `.local/healthResort.sef.json`
 * (kompilacja: `xslt3 -xsl:...plCdaReferralToHealthResort.xslt -export:... -nogo`).
 *
 * Uruchom: pnpm tsx scripts/validate-referral.ts
 */
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error - saxon-js nie dostarcza typów
import SaxonJS from "saxon-js";
import {
  buildHealthResortReferralCda,
  type HealthResortReferralInput,
} from "../packages/cda/src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const SEF = resolve(here, "../.local/healthResort.sef.json");

if (!existsSync(SEF)) {
  console.error("Brak .local/healthResort.sef.json — skompiluj walidator (xslt3). Pomijam.");
  process.exit(0);
}

const input: HealthResortReferralInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  title: "Skierowanie na leczenie uzdrowiskowe",
  treatmentType: "LU",
  realizationMode: "TS",
  nfzBranchCode: "07",
  patient: {
    pesel: "62091512345",
    givenNames: ["Jan", "Franciszek"],
    familyName: "Kowalski",
    birthDate: "19620915",
    gender: "M",
    address: {
      use: "HP",
      city: "Strzelin",
      postalCode: "57-100",
      street: "Mickiewicza",
      houseNumber: "20",
      country: "Polska",
    },
  },
  author: {
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
  },
  legalAuthenticator: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz / dentysta",
  },
  socialHistory: "Nie dotyczy",
  medicalHistory: { complaints: "Bóle kręgosłupa", previousSpaTreatment: "NIE" },
  physicalExam: {
    vitalSigns: { systolicBP: 140, diastolicBP: 85, weight: 88, height: 190, heartRate: 90 },
    systems: { respiratory: "Wydolny", musculoskeletal: "Ograniczenie ruchomości" },
    selfCareAbility: true,
    contraindicationsForNaturalResources: false,
    justifications: ["PSR", "LPB"],
  },
  diagnoses: {
    main: {
      icd10Code: "I25.2",
      icd10Name: "Stary (przebyty) zawał serca",
      description: "Przebyty zawał mięśnia sercowego",
    },
    secondary: [
      { icd10Code: "I10", icd10Name: "Nadciśnienie pierwotne", description: "Nadciśnienie" },
    ],
  },
  labResults: [
    { icd9Code: "A01", icd9Name: "Mocz badanie ogólne", date: "20240101" },
    { icd9Code: "C55", icd9Name: "Morfologia krwi", date: "20240101" },
    { icd9Code: "C59", icd9Name: "OB", date: "20240101" },
  ],
  correspondenceMode: "P",
};

const { xml } = buildHealthResortReferralCda(input);

const result = SaxonJS.transform(
  { stylesheetFileName: SEF, sourceText: xml, destination: "serialized" },
  "sync",
) as { principalResult: string };

const svrl = result.principalResult;

interface Violation {
  readonly location: string;
  readonly text: string;
  readonly role: string;
}

const violations: Violation[] = [];
const pattern = /<svrl:failed-assert\b([^>]*)>([\s\S]*?)<\/svrl:failed-assert>/g;
for (const match of svrl.matchAll(pattern)) {
  const attrs = match[1] ?? "";
  const body = match[2] ?? "";
  const location = /location="([^"]*)"/.exec(attrs)?.[1] ?? "";
  const role = /role="([^"]*)"/.exec(attrs)?.[1] ?? "error";
  const text = (/<svrl:text>([\s\S]*?)<\/svrl:text>/.exec(body)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
  violations.push({ location, text, role });
}

const errors = violations.filter((v) => v.role !== "warning");
const warnings = violations.filter((v) => v.role === "warning");

console.log(`\nWalidacja Schematron P1 (plCdaReferralToHealthResort)`);
console.log(`Dokument: ${xml.length} znaków`);
console.log(`Błędy: ${errors.length}, ostrzeżenia: ${warnings.length}\n`);

const show = (label: string, list: Violation[]): void => {
  if (list.length === 0) return;
  console.log(`── ${label} ──`);
  for (const v of list.slice(0, 40)) {
    console.log(`• ${v.text}`);
    if (v.location) console.log(`    @ ${v.location}`);
  }
  if (list.length > 40) console.log(`  … i ${list.length - 40} więcej`);
  console.log("");
};

show("BŁĘDY", errors);
show("OSTRZEŻENIA", warnings);

if (process.env.DUMP) {
  writeFileSync(resolve(here, "../.local/last-referral.xml"), xml);
}

process.exit(errors.length > 0 ? 1 : 0);
