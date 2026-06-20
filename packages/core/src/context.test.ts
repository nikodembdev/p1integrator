import { describe, expect, it } from "vitest";
import { type CallContext, CONTEXT_ATTR, contextToAttributes } from "./context.js";

const base: CallContext = {
  subject: { root: "1.2.3", extension: "P" },
  user: { root: "1.2.4", extension: "U" },
  workplace: { root: "1.2.5", extension: "M" },
  businessRole: "DOCTOR",
};

describe("contextToAttributes", () => {
  it("flattens the required attributes (7 entries without an assistant)", () => {
    const attributes = contextToAttributes(base);
    expect(attributes).toHaveLength(7);
    expect(attributes).toContainEqual({ name: CONTEXT_ATTR.idPodmiotuOidRoot, value: "1.2.3" });
    expect(attributes).toContainEqual({ name: CONTEXT_ATTR.idPodmiotuOidExt, value: "P" });
    expect(attributes).toContainEqual({
      name: CONTEXT_ATTR.rolaBiznesowa,
      value: "LEKARZ_LEK_DENTYSTA_FELCZER",
    });
  });

  it("adds medical assistant attributes when provided", () => {
    const attributes = contextToAttributes({
      ...base,
      medicalAssistant: { root: "1.2.6", extension: "A" },
    });
    expect(attributes).toHaveLength(9);
    expect(attributes).toContainEqual({
      name: CONTEXT_ATTR.idAsystentaMedycznegoOidExt,
      value: "A",
    });
  });
});
