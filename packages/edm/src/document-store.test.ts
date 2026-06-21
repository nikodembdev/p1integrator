import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { documentMetadata, sha1Hex } from "./document-store.js";

describe("sha1Hex / documentMetadata", () => {
  const content = Buffer.from("<ClinicalDocument/>", "utf8");

  it("liczy SHA-1 jako hex zgodnie z node:crypto", () => {
    const expected = createHash("sha1").update(content).digest("hex");
    expect(sha1Hex(content)).toBe(expected);
    expect(sha1Hex(content)).toMatch(/^[0-9a-f]{40}$/);
  });

  it("buduje metadane indeksu (hash + rozmiar + uniqueId)", () => {
    const meta = documentMetadata(content, "text/xml", "2.16.840.1.113883.3.4424.X^1");
    expect(meta.size).toBe(content.byteLength);
    expect(meta.mimeType).toBe("text/xml");
    expect(meta.uniqueId).toBe("2.16.840.1.113883.3.4424.X^1");
    expect(meta.hash).toBe(sha1Hex(content));
  });
});
