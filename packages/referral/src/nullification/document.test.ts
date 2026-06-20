import { create } from "xmlbuilder2";
import { describe, expect, it } from "vitest";
import { buildNullificationCda, type NullificationInput } from "./document.js";

const input: NullificationInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  documentId: "1234567890123456789012",
  documentDate: "20260620120000",
  patient: {
    pesel: "62091512345",
    internalId: "12345",
    givenNames: ["Jan"],
    familyName: "Kowalski",
  },
  author: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
    givenNames: ["Piotr"],
    familyName: "Nowak",
  },
  legalAuthenticator: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
  },
  annulledDocument: {
    idRoot: "2.16.840.1.113883.3.4424.2.7.999.4.1",
    idExtension: "9999999999999999999999",
    versionNumber: 1,
  },
  description: "Anulowanie skierowania z powodu błędnych danych pacjenta",
};

describe("buildNullificationCda", () => {
  const result = buildNullificationCda(input);

  it("emits the P1 + IHE template ids, the administrative code and the fixed title", () => {
    expect(() => create(result.xml)).not.toThrow();
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.1.14" extension="1.3.2"');
    expect(result.xml).toContain('root="1.3.6.1.4.1.19376.1.9.1.1.1"');
    expect(result.xml).toContain('code="51851-4"');
    expect(result.xml).toContain('code="08.80"');
    expect(result.xml).toContain("<title>Dokument anulujący</title>");
    expect(result.xml).toContain("<title>Dane dokumentu anulowanego</title>");
  });

  it("references the annulled document as a replaced previous version (RPLC, version+1)", () => {
    expect(result.xml).toContain('typeCode="RPLC"');
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.2.46"');
    expect(result.xml).toContain('<versionNumber value="2"/>'); // anulowanie = oryginał (1) + 1
    expect(result.xml).toContain('<versionNumber value="1"/>'); // parentDocument = oryginał
    // setId dokumentu = setId dokumentu anulowanego
    expect(result.xml).toContain('extension="9999999999999999999999"');
  });
});
