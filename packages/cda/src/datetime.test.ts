import { describe, expect, it } from "vitest";
import { formatCdaDate, formatCdaDateTime } from "./datetime.js";

describe("formatCdaDate / formatCdaDateTime", () => {
  it("formats with zero-padding and no separators", () => {
    const date = new Date(2026, 5, 9, 4, 7, 5); // 2026-06-09 04:07:05 local
    expect(formatCdaDate(date)).toBe("20260609");
    expect(formatCdaDateTime(date)).toBe("20260609040705");
  });
});
