import { describe, expect, it } from "vitest";
import { oid, OID_ROOT, oidEquals } from "./oid.js";

describe("oid", () => {
  it("accepts a valid root and extension", () => {
    const result = oid(OID_ROOT.PESEL, "44051401359");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.root).toBe(OID_ROOT.PESEL);
      expect(result.value.extension).toBe("44051401359");
    }
  });

  it("rejects an invalid root", () => {
    const result = oid("not-an-oid", "1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("validation");
  });

  it("rejects an empty extension", () => {
    expect(oid(OID_ROOT.PESEL, "   ").ok).toBe(false);
  });
});

describe("oidEquals", () => {
  it("compares root and extension", () => {
    const a = { root: "1.2.3", extension: "x" };
    expect(oidEquals(a, { root: "1.2.3", extension: "x" })).toBe(true);
    expect(oidEquals(a, { root: "1.2.3", extension: "y" })).toBe(false);
  });
});
