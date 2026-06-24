/**
 * Lokalny walidator IPOM: buduje przykładowy plan opieki medycznej i przepuszcza
 * go przez ORYGINALNY walidator Schematron P1 (SEF), raportując naruszenia (SVRL).
 *
 * Uruchom: pnpm tsx scripts/validate-ipom.ts   (DUMP=1 zapisuje XML do .local/last-ipom.xml)
 */
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error - saxon-js nie dostarcza typów
import SaxonJS from "saxon-js";
import { buildIpomCda, type IpomInput } from "@p1/ipom";

const here = dirname(fileURLToPath(import.meta.url));
const SEF = resolve(here, "../.local/ipom.sef.json");
if (!existsSync(SEF)) {
  console.error(
    "Brak .local/ipom.sef.json - skompiluj walidator (scripts/compile-schematron.mjs). Pomijam.",
  );
  process.exit(0);
}

const input: IpomInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  providerOrganizationId: "1099",
  documentDate: "20260622120000",
  patient: {
    pesel: "40010151673",
    givenNames: ["Sylwester"],
    familyName: "Senior",
    birthDate: "19400101",
    gender: "M",
    internalId: "1234567",
    address: {
      city: "Warszawa",
      postalCode: "01-134",
      street: "Odkryta",
      houseNumber: "41",
      unitId: "12",
      terytSimc: "1417082",
      terytTerc: "3989898",
    },
  },
  author: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
    specialtyCode: "",
    specialtyDisplay: "",
    prefix: "lek.",
    givenNames: ["Piotr"],
    familyName: "Nowak",
    organization: {
      providerExt: "000000000000",
      providerRoot: "2.16.840.1.113883.3.4424.2.3.1",
      regon14: "00000000000000",
      regon9: "000000000",
      name: "PRZYCHODNIA EUROMEDI",
      phone: "22-1111123",
      address: {
        postalCode: "00-950",
        city: "Warszawa",
        street: "Marszałkowska",
        houseNumber: "320",
      },
      nfzBranchCode: "07",
      nfzContractNumber: "123456",
    },
  },
  legalAuthenticator: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
  },
  healthStatus: {
    assessmentDate: "20260620",
    stratification: "S",
    summary: "Stan pacjenta stabilny, unormowane wyniki badań diagnostycznych",
  },
  diagnoses: [
    { code: "E11.0", name: "Cukrzyca" },
    { code: "E78.0", name: "Hipercholesterolemia" },
  ],
  medications: [
    {
      gtin: "05909990789276",
      name: "Polocard",
      displayName: "Polocard 150mg",
      dosage: "2x1",
      duration: "bezterminowo",
    },
    {
      gtin: "05909997747446",
      name: "Metformina 500mg",
      dosage: "2x1 tabl. rano i wieczorem",
      duration: "przez 90 dni",
    },
  ],
  education: {
    dietaryCount: 3,
    nursingCount: 6,
    otherRecommendations:
      "Regularne ćwiczenia fizyczne - minimum 3 razy w tygodniu spacer 60 minut.",
  },
  diagnosticTests: [
    {
      kind: "lab",
      code: "C55",
      name: "Morfologia krwi, z pełnym różnicowaniem granulocytów",
      schedule: { kind: "INTERWAL", label: "Co 1 mies.", period: { value: "1", unit: "mo" } },
    },
    {
      kind: "lab",
      code: "A15",
      name: "Glukoza w moczu",
      schedule: { kind: "NAJSZYB", label: "Najszybciej jak to możliwe" },
    },
    {
      kind: "lab",
      code: "L55",
      name: "Hemoglobina glikowana (HbA1c)",
      schedule: { kind: "DOCZASU", label: "Do 1.12.2026", date: "20261201" },
    },
    {
      kind: "imaging",
      code: "88.769",
      name: "USG brzucha - inne",
      schedule: { kind: "PRZEDNASTWIZ", label: "Przed następną wizytą" },
    },
    {
      kind: "other",
      code: "89.502",
      name: "Holter EKG",
      schedule: {
        kind: "CZASPRZEDWIZ",
        label: "Na 1 mies. przed wizytą",
        quantity: { value: "1", unit: "mo" },
      },
    },
  ],
  controlVisits: [
    {
      kind: "POWYKZLECZADAN",
      planLabel: "Po wykonaniu zleconych zadań (Badania cholesterolu)",
      requiredTasks: "Badania cholesterolu",
    },
    { kind: "POOKRCZASIE", planLabel: "Za 1 mies.", quantity: { value: "1", unit: "mo" } },
    { kind: "INTERWAL", planLabel: "Co 3 mies.", period: { value: "3", unit: "mo" } },
  ],
  specialistVisits: [
    { specialist: "KARDIO", required: true },
    { specialist: "ENDOKR", required: false },
    { specialist: "DIAEND", required: true },
    { specialist: "PULALE", required: false },
  ],
};

const xml = buildIpomCda(input).xml;
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
console.log(`\nWalidacja Schematron P1 (IPOM) - dokument ${xml.length} znaków`);
console.log(`Błędy: ${errors.length}, ostrzeżenia: ${violations.length - errors.length}\n`);
for (const v of errors.slice(0, 50)) {
  console.log(`• ${v.text}`);
  if (v.location) console.log(`    @ ${v.location}`);
}

if (process.env.DUMP) writeFileSync(resolve(here, "../.local/last-ipom.xml"), xml);
process.exit(errors.length > 0 ? 1 : 0);
