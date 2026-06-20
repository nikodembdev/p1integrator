import type { Options } from "tsup";

/** Wspólna konfiguracja builda dla wszystkich paczek @p1/*. */
export const baseConfig: Options = {
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "node20",
  outDir: "dist",
};
