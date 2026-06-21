/**
 * Lokalny walidator skierowań: buduje przykładowy dokument danego typu i przepuszcza
 * go przez ORYGINALNY walidator Schematron P1 (SEF), raportując naruszenia (SVRL).
 * Dane przykładowe i mapa typów: test/integration/fixtures.ts.
 *
 * Uruchom: pnpm tsx scripts/validate-referral.ts [typ]   (DUMP=1 zapisuje XML do .local/last-<typ>.xml)
 */
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error - saxon-js nie dostarcza typów
import SaxonJS from "saxon-js";
import { referralCases } from "../test/integration/fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const type = process.argv[2] ?? "health-resort";
const selected = referralCases.find((c) => c.name === type);
if (!selected) {
  const names = referralCases.map((c) => c.name).join(", ");
  console.error(`Nieznany typ: ${type}. Dostępne: ${names}`);
  process.exit(1);
}

const SEF = resolve(here, `../.local/${selected.sef}`);
if (!existsSync(SEF)) {
  console.error(
    `Brak .local/${selected.sef} - skompiluj walidator (scripts/compile-schematron.mjs). Pomijam.`,
  );
  process.exit(0);
}

const xml = selected.build();
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
console.log(`\nWalidacja Schematron P1 (${type}) - dokument ${xml.length} znaków`);
console.log(`Błędy: ${errors.length}, ostrzeżenia: ${violations.length - errors.length}\n`);
for (const v of errors.slice(0, 40)) {
  console.log(`• ${v.text}`);
  if (v.location) console.log(`    @ ${v.location}`);
}

if (process.env.DUMP) writeFileSync(resolve(here, `../.local/last-${type}.xml`), xml);
process.exit(errors.length > 0 ? 1 : 0);
