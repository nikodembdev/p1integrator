import { describe, expect, it } from "vitest";
import { generateDocumentId, isValidDocumentId } from "./document-id.js";

describe("generateDocumentId", () => {
  it("produces a 22-digit id whose first digit is not zero", () => {
    for (let i = 0; i < 100; i += 1) {
      const id = generateDocumentId();
      expect(id).toMatch(/^[1-9]\d{21}$/);
      expect(isValidDocumentId(id)).toBe(true);
    }
  });

  it("produces distinct ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateDocumentId()));
    expect(ids.size).toBe(50);
  });
});

describe("isValidDocumentId", () => {
  it("rejects ids of wrong length, leading zero or non-digits", () => {
    expect(isValidDocumentId("123")).toBe(false);
    expect(isValidDocumentId(`0${"1".repeat(21)}`)).toBe(false);
    expect(isValidDocumentId(`${"1".repeat(21)}x`)).toBe(false);
  });
});
