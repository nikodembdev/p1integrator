import { create } from "xmlbuilder2";
import { describe, expect, it } from "vitest";
import { buildClinicalDocumentHeader } from "./clinical-document.js";
import type { ClinicalDocumentHeaderInput } from "./types.js";

const input: ClinicalDocumentHeaderInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  title: "Skierowanie na leczenie uzdrowiskowe",
  treatmentType: "LU",
  realizationMode: "TS",
  nfzBranchCode: "07",
  documentId: "1234567890123456789012",
  documentDate: "20260620120000",
  patient: {
    pesel: "62091512345",
    givenNames: ["Jan", "Franciszek"],
    familyName: "Kowalski",
    birthDate: "19620915",
    gender: "M",
    email: "jan@example.pl",
    address: {
      use: "PST",
      city: "Berlin",
      postalCode: "01-134",
      street: "Alexandreplatz",
      houseNumber: "41",
      unitId: "12",
      country: "Niemcy",
    },
  },
  author: {
    authorExt: "AUTH-1",
    authorRoot: "2.16.840.1.113883.3.4424.2.7.999.7",
    functionCode: "LEK",
    functionDisplay: "Lekarz / dentysta",
    specialtyCode: "0718_0726",
    specialtyDisplay: "neurologia, radiologia i diagnostyka obrazowa",
    givenNames: ["Piotr"],
    familyName: "Nowak",
    organization: {
      providerExt: "PROV-1",
      providerRoot: "2.16.840.1.113883.3.4424.2.3.1",
      regon14: "12345678901234",
      regon9: "123456789",
      name: "Poradnia POZ",
      phone: "22-1111123",
      nfzBranchCode: "07",
      nfzContractNumber: "12345678",
      address: {
        postalCode: "57-100",
        city: "Strzelin",
        street: "ul. Adama Mickiewicza",
        houseNumber: "20",
      },
    },
  },
  legalAuthenticator: {
    authorExt: "AUTH-1",
    authorRoot: "2.16.840.1.113883.3.4424.2.7.999.7",
    functionCode: "LEK",
    functionDisplay: "Lekarz / dentysta",
  },
};

describe("buildClinicalDocumentHeader", () => {
  const result = buildClinicalDocumentHeader(input);

  it("returns the document id and date and emits well-formed XML", () => {
    expect(result.documentId).toBe("1234567890123456789012");
    expect(result.documentDate).toBe("20260620120000");
    expect(() => create(result.xml)).not.toThrow();
  });

  it("emits the CDA root, stylesheet and document template", () => {
    expect(result.xml).toContain('href="CDA_PL_IG_1.3.2.xsl"');
    expect(result.xml).toContain('xsi:type="extPL:ClinicalDocument"');
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.1.9" extension="1.3.2"');
    expect(result.xml).toContain(
      'extension="1234567890123456789012" root="2.16.840.1.113883.3.4424.2.7.999.4.1"',
    );
  });

  it("encodes treatment type and realization mode as code qualifiers", () => {
    expect(result.xml).toContain('code="57832-8"');
    expect(result.xml).toContain('code="LU" displayName="Leczenie uzdrowiskowe"');
    expect(result.xml).toContain('code="TS" displayName="Tryb stacjonarny"');
  });

  it("builds the patient record target", () => {
    expect(result.xml).toContain('extension="62091512345" root="2.16.840.1.113883.3.4424.1.1.616"');
    expect(result.xml).toContain("<given>Jan</given>");
    expect(result.xml).toContain("<given>Franciszek</given>");
    expect(result.xml).toContain("<family>Kowalski</family>");
    expect(result.xml).toContain('<administrativeGenderCode code="M"');
    expect(result.xml).toContain('value="mailto:jan@example.pl"');
  });

  it("builds the author with the provider organization hierarchy and NFZ contract", () => {
    expect(result.xml).toContain("<family>Nowak</family>");
    expect(result.xml).toContain(
      'extension="12345678901234" root="2.16.840.1.113883.3.4424.2.2.2"',
    );
    expect(result.xml).toContain('extension="123456789" root="2.16.840.1.113883.3.4424.2.2.1"');
    expect(result.xml).toContain("extPL:reimbursementRelatedContract");
    expect(result.xml).toContain('extension="07" root="2.16.840.1.113883.3.4424.3.1"');
  });

  it("builds custodian, legal authenticator and NFZ participant", () => {
    expect(result.xml).toContain('assigningAuthorityName="CSIOZ"');
    expect(result.xml).toContain('<signatureCode code="S"');
    expect(result.xml).toContain('<participant typeCode="IND">');
  });

  it("escapes special characters via xmlbuilder2", () => {
    const escaped = buildClinicalDocumentHeader({ ...input, title: "A & B <x>" });
    expect(escaped.xml).toContain("A &amp; B &lt;x&gt;");
  });

  it("generates a document id when none is provided", () => {
    const { documentId: _omitted, ...withoutId } = input;
    const generated = buildClinicalDocumentHeader(withoutId);
    expect(generated.documentId).toMatch(/^[1-9]\d{21}$/);
  });
});
