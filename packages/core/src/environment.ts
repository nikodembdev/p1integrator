/** Środowiska P1. */
export type P1Environment = "integration" | "production";

export const P1_ENVIRONMENTS: readonly P1Environment[] = ["integration", "production"];

export const isP1Environment = (value: string): value is P1Environment =>
  (P1_ENVIRONMENTS as readonly string[]).includes(value);
