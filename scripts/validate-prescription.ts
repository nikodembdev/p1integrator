/**
 * Lokalny walidator recepty: buduje przykładowy dokument i przepuszcza go przez
 * ORYGINALNY walidator Schematron P1 (SEF), raportując naruszenia (SVRL).
 *
 * Uruchom: pnpm tsx scripts/validate-prescription.ts   (DUMP=1 → .local/last-prescription.xml)
 */
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error - saxon-js nie dostarcza typów
import SaxonJS from "saxon-js";
import {
  buildDrugPrescriptionCda,
  type DrugPrescriptionInput,
} from "../packages/prescription/src/index.js";

const here = dirname(fileURLToPath(import.meta.url));

export const prescriptionSample: DrugPrescriptionInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.1491",
  prescriptionNumber: "00000000000000000001",
  versionSetId: { root: "2.16.840.1.113883.3.4424.2.7.17.2.2", extension: "1" },
  versionNumber: 1,
  effectiveDate: "20260619",
  sectionId: "1",
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
    availabilityCategory: "Rp",
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
  payment: {
    nfzBranch: "07",
    level: "100%",
    levelDisplay: "ryczałt",
    packageCount: "4",
  },
  substitution: false,
  dispenserInfo: "Brak",
};

const SEF = resolve(
  here,
  "../.local/p1-docs/recepta/specyfikacje/schematron/schematron/1.3.2/plcda-schematron-DrugPrescription/plcda-plCdaDrugPrescription.sef.json",
);
const { xml } = buildDrugPrescriptionCda(prescriptionSample);
if (process.env.DUMP) writeFileSync(resolve(here, "../.local/last-prescription.xml"), xml);

if (!existsSync(SEF)) {
  console.error(`Brak SEF (${SEF}) — skompiluj walidator. Pomijam.`);
  process.exit(0);
}

const result = SaxonJS.transform(
  { stylesheetFileName: SEF, sourceText: xml, destination: "serialized" },
  "sync",
) as { principalResult: string };

const violations: { text: string; location: string; role: string }[] = [];
for (const match of result.principalResult.matchAll(
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
console.log(`\nWalidacja Schematron P1 (recepta) — dokument ${xml.length} znaków`);
console.log(`Błędy: ${errors.length}, ostrzeżenia: ${violations.length - errors.length}\n`);
for (const v of errors.slice(0, 50)) {
  console.log(`• ${v.text}`);
  if (v.location) console.log(`    @ ${v.location}`);
}
process.exit(errors.length > 0 ? 1 : 0);
