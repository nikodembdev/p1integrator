import { describe, expect, it } from "vitest";
import { npwz, pesel, peselSex } from "./identifiers.js";

describe("pesel", () => {
  it("accepts a number with a valid checksum", () => {
    const result = pesel("44051401359");
    expect(result.ok).toBe(true);
  });

  it("rejects an invalid checksum", () => {
    const result = pesel("44051401358");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("validation");
  });

  it("rejects invalid length/format", () => {
    expect(pesel("123").ok).toBe(false);
    expect(pesel("4405140135x").ok).toBe(false);
  });

  it("decodes sex from the 10th digit", () => {
    const male = pesel("44051401359");
    const female = pesel("44051401342");
    expect(male.ok && peselSex(male.value)).toBe("M");
    expect(female.ok && peselSex(female.value)).toBe("F");
  });
});

describe("npwz", () => {
  it("accepts a number with a valid check digit", () => {
    // 2234567: (1·2+2·3+3·4+4·5+5·6+6·7) mod 11 = 112 mod 11 = 2 = first digit
    expect(npwz("2234567").ok).toBe(true);
  });

  it("rejects an invalid check digit", () => {
    expect(npwz("2234568").ok).toBe(false);
  });

  it("rejects invalid length/format", () => {
    expect(npwz("123").ok).toBe(false);
    expect(npwz("abcdefg").ok).toBe(false);
  });
});
