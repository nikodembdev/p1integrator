/**
 * Konformancja CDA: każdy typ skierowania przechodzi (1) oryginalny Schematron P1
 * (SEF, Saxon-JS) oraz (2) XSD PIK HL7 CDA (extPL_r3, xmllint). XSD łapie to, czego
 * Schematron nie sprawdza (np. unikalność xs:ID). Assety w `.local/` (poufne dokumenty
 * P1) — testy pomijają się automatycznie, gdy ich brak (np. czysty klon / publiczne CI).
 *
 * Uruchom: pnpm test:conformance
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error - saxon-js nie dostarcza typów
import SaxonJS from "saxon-js";
import { referralCases } from "./fixtures.js";

const ROOT = resolve(import.meta.dirname, "../..");
const LOCAL = resolve(ROOT, ".local");
const XSD = resolve(LOCAL, "p1-docs/recepta/specyfikacje/schema/xsd/extPL_r3.xsd");

const hasXmllint = (() => {
  try {
    execFileSync("xmllint", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/** Liczy naruszenia Schematron (failed-assert) inne niż ostrzeżenia. */
function schematronErrors(sefPath: string, xml: string): string[] {
  const result = SaxonJS.transform(
    { stylesheetFileName: sefPath, sourceText: xml, destination: "serialized" },
    "sync",
  ) as { principalResult: string };
  const errors: string[] = [];
  for (const m of result.principalResult.matchAll(
    /<svrl:failed-assert\b([^>]*)>([\s\S]*?)<\/svrl:failed-assert>/g,
  )) {
    const attrs = m[1] ?? "";
    if (/role="warning"/.test(attrs)) continue;
    const text = /<svrl:text>([\s\S]*?)<\/svrl:text>/.exec(m[2] ?? "")?.[1] ?? "";
    errors.push(text.replace(/\s+/g, " ").trim());
  }
  return errors;
}

describe("konformancja CDA skierowań (Schematron P1 + XSD)", () => {
  for (const referral of referralCases) {
    const sefPath = resolve(LOCAL, referral.sef);

    it.skipIf(!existsSync(sefPath))(`${referral.name}: Schematron P1 — 0 błędów`, () => {
      const errors = schematronErrors(sefPath, referral.build());
      expect(errors, errors.join("\n")).toHaveLength(0);
    });

    it.skipIf(!hasXmllint || !existsSync(XSD))(`${referral.name}: zgodny z XSD PIK HL7 CDA`, () => {
      const xml = referral.build();
      // xmllint czyta dokument ze stdin; extPL_r3 rozwiązuje xsi:type=extPL:ClinicalDocument.
      expect(() =>
        execFileSync("xmllint", ["--noout", "--schema", XSD, "-"], { input: xml, stdio: "pipe" }),
      ).not.toThrow();
    });
  }
});
