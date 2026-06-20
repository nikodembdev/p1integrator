import { describe, expect, it } from "vitest";
import { err, isErr, isOk, map, mapErr, ok, unwrapOr } from "./result.js";

describe("Result", () => {
  it("builds the correct ok/err variants", () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err("e")).toEqual({ ok: false, error: "e" });
  });

  it("narrows the type with isOk/isErr", () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(ok(1))).toBe(false);
    expect(isErr(err("e"))).toBe(true);
  });

  it("maps only the Ok value", () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6));
    expect(map(err<string>("e"), (n: number) => n * 3)).toEqual(err("e"));
  });

  it("mapErr maps only the Err error", () => {
    expect(mapErr(err("e"), (e) => `${e}!`)).toEqual(err("e!"));
    expect(mapErr(ok(1), (e: string) => `${e}!`)).toEqual(ok(1));
  });

  it("unwrapOr returns the fallback for Err", () => {
    expect(unwrapOr(ok(1), 9)).toBe(1);
    expect(unwrapOr(err("e"), 9)).toBe(9);
  });
});
