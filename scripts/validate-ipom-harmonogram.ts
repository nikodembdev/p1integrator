/**
 * Lokalny walidator harmonogramu IPOM: buduje przykładowy harmonogram i przepuszcza
 * go przez ORYGINALNY walidator Schematron P1 (schedule SEF).
 *
 * Uruchom: pnpm tsx scripts/validate-ipom-harmonogram.ts   (DUMP=1 → .local/last-ipom-harmonogram.xml)
 */
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error - saxon-js nie dostarcza typów
import SaxonJS from "saxon-js";
import { buildIpomScheduleCda, type IpomScheduleInput } from "@p1/ipom";

const here = dirname(fileURLToPath(import.meta.url));
const SEF = resolve(here, "../.local/ipom-schedule.sef.json");
if (!existsSync(SEF)) {
  console.error("Brak .local/ipom-schedule.sef.json - skompiluj walidator. Pomijam.");
  process.exit(0);
}

const input: IpomScheduleInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  providerOrganizationId: "1099",
  documentDate: "20260623120000",
  plan: {
    documentId: "1234567890123456789012",
    documentSetId: "1234567890123456789012",
    versionNumber: 1,
  },
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
  healthStatus: { assessmentDate: "20260620", stratification: "S", summary: "Stan stabilny" },
  diagnoses: [{ code: "E11.0", name: "Cukrzyca" }],
  education: {
    dietaryCount: 3,
    nursingCount: 6,
    otherRecommendations: "Regularne ćwiczenia fizyczne.",
    dietaryRealizations: [
      { status: "ZRL", date: "20260115" },
      { status: "ZPL", date: "20260217" },
    ],
    nursingRealizations: [{ status: "NZPL" }],
  },
  diagnosticTests: [
    {
      kind: "lab",
      code: "C55",
      name: "Morfologia krwi",
      schedule: { kind: "INTERWAL", label: "Co 1 mies.", period: { value: "1", unit: "mo" } },
      realizations: [{ status: "ZRL", date: "20260115" }],
    },
  ],
  controlVisits: [
    {
      kind: "POWYKZLECZADAN",
      planLabel: "Po wykonaniu zleconych badań",
      requiredTasks: "Badania cholesterolu",
      realizations: [{ status: "NZPL" }],
    },
    {
      kind: "INTERWAL",
      planLabel: "Co 3 mies.",
      period: { value: "3", unit: "mo" },
      realizations: [{ status: "ZPL", date: "20260217" }],
    },
  ],
  specialistVisits: [
    { specialist: "KARDIO", required: true, realizations: [{ status: "ZPL", date: "20260217" }] },
  ],
};

const xml = buildIpomScheduleCda(input).xml;
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
console.log(`\nWalidacja Schematron P1 (IPOM harmonogram) - dokument ${xml.length} znaków`);
console.log(`Błędy: ${errors.length}, ostrzeżenia: ${violations.length - errors.length}\n`);
for (const v of errors.slice(0, 50)) {
  console.log(`• ${v.text}`);
  if (v.location) console.log(`    @ ${v.location}`);
}

if (process.env.DUMP) writeFileSync(resolve(here, "../.local/last-ipom-harmonogram.xml"), xml);
process.exit(errors.length > 0 ? 1 : 0);
