import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (pkg: string): string =>
  fileURLToPath(new URL(`packages/${pkg}/src/index.ts`, import.meta.url));

/**
 * Testy integracyjne (konformancja Schematron/XSD + e2e na P1) — POZA domyślnym `pnpm test`.
 * Wymagają assetów w `.local/` (SEF, XSD) lub certów (e2e); bez nich poszczególne testy się
 * pomijają. Uruchom: `pnpm test:conformance` / `pnpm test:e2e`.
 * Aliasy @p1/* → źródła, żeby testować kod bez kroku build.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@p1/core": src("core"),
      "@p1/cda": src("cda"),
      "@p1/transport": src("transport"),
      "@p1/signing": src("signing"),
      "@p1/referral": src("referral"),
    },
  },
  test: {
    include: ["test/integration/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    passWithNoTests: true,
  },
});
