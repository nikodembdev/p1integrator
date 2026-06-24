/**
 * Lokalny walidator dokumentu anulującego IPOM: buduje przykładowy „Dokument
 * anulujący" i przepuszcza go przez ORYGINALNY walidator Schematron P1 (nullification SEF).
 *
 * Uruchom: pnpm tsx scripts/validate-ipom-anulowanie.ts   (DUMP=1 → .local/last-ipom-anulowanie.xml)
 */
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error - saxon-js nie dostarcza typów
import SaxonJS from "saxon-js";
import { buildIpomCancellationCda, type IpomCancellationInput } from "@p1/ipom";

const here = dirname(fileURLToPath(import.meta.url));
const SEF = resolve(here, "../.local/ipom-nullification.sef.json");
if (!existsSync(SEF)) {
  console.error("Brak .local/ipom-nullification.sef.json - skompiluj walidator. Pomijam.");
  process.exit(0);
}

const input: IpomCancellationInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  cancellationNumber: "9999999999999999999999",
  effectiveDate: "20260623120000",
  nfzBranch: "07",
  cancelled: {
    documentId: "1234567890123456789012",
    documentSetId: "1234567890123456789012",
    versionNumber: 1,
    issuedDate: "22.06.2026",
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
    },
  },
  author: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
    specialtyCode: "0718",
    specialtyDisplay: "neurologia",
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
        postalCode: "57-100",
        city: "Strzelin",
        street: "ul. Adama Mickiewicza",
        houseNumber: "20",
      },
      nfzBranchCode: "07",
      nfzContractNumber: "123456",
    },
  },
  authorSpecialtyCode: "0718",
  authorSpecialtyName: "neurologia",
  legalAuthenticator: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
  },
};

const xml = buildIpomCancellationCda(input).xml;
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
console.log(`\nWalidacja Schematron P1 (IPOM anulowanie) - dokument ${xml.length} znaków`);
console.log(`Błędy: ${errors.length}, ostrzeżenia: ${violations.length - errors.length}\n`);
for (const v of errors.slice(0, 50)) {
  console.log(`• ${v.text}`);
  if (v.location) console.log(`    @ ${v.location}`);
}

if (process.env.DUMP) writeFileSync(resolve(here, "../.local/last-ipom-anulowanie.xml"), xml);
process.exit(errors.length > 0 ? 1 : 0);
