/**
 * Kompiluje surowy Schematron P1 (.sch, ART-DECOR) do SEF (Saxon-JS), gotowego
 * do walidacji. Kroki: inline include'ów (w JS — saxonowy iso_dsdl_include
 * przepełnia stos przy ~161 include'ach) → iso_abstract_expand → iso_svrl_for_xslt2
 * → fix błędnego regexa P1 → kompilacja SEF.
 *
 * Użycie: node scripts/compile-schematron.mjs <ścieżka.sch> <wyjście.sef.json>
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const [schPath, sefOut] = process.argv.slice(2);
if (!schPath || !sefOut) {
  console.error("Użycie: node scripts/compile-schematron.mjs <.sch> <.sef.json>");
  process.exit(1);
}

const SKEL = ".local/schematron-skeleton";
const XSLT3 = "node_modules/.bin/xslt3";

/** Rekurencyjnie wstawia treść <include href> (zamiast saxonowego iso_dsdl_include). */
function inline(path, seen = new Set()) {
  const xml = readFileSync(path, "utf8").replace(/<\?xml[^?]*\?>/g, "");
  const dir = dirname(path);
  return xml.replace(/<(?:sch:)?include\s+href="([^"]+)"\s*\/>/g, (_match, href) => {
    const target = join(dir, href);
    if (seen.has(target)) return "";
    seen.add(target);
    return inline(target, seen).replace(/<\/?(?:sch:)?schema\b[^>]*>/g, "");
  });
}

const tmp = mkdtempSync(join(tmpdir(), "p1-sch-"));
const included = join(tmp, "included.sch");
const expanded = join(tmp, "expanded.sch");
// Walidator MUSI powstać w katalogu źródłowym .sch — reguły używają `doc('include/voc-*.xml')`
// rozwiązywanego względem statycznego base URI walidatora (zapamiętanego w SEF).
const validator = join(dirname(schPath), ".p1-validator.xsl");

writeFileSync(included, inline(schPath));
execFileSync(XSLT3, [`-xsl:${SKEL}/iso_abstract_expand.xsl`, `-s:${included}`, `-o:${expanded}`], {
  stdio: "inherit",
});
execFileSync(XSLT3, [`-xsl:${SKEL}/iso_svrl_for_xslt2.xsl`, `-s:${expanded}`, `-o:${validator}`], {
  stdio: "inherit",
});

// P1 ma błędny regex `^+?[0-9]*$` (Saxon-EE toleruje, Saxon-JS odrzuca → escape).
const patched = readFileSync(validator, "utf8").split("^+?[0-9]*$").join("^\\+?[0-9]*$");
writeFileSync(validator, patched);

execFileSync(XSLT3, [`-xsl:${validator}`, `-export:${sefOut}`, "-nogo"], { stdio: "inherit" });
rmSync(validator, { force: true });
console.log(`SEF gotowy: ${sefOut} (doc() bazuje na ${dirname(schPath)}/include)`);
