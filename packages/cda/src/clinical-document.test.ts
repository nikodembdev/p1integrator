import { create } from "xmlbuilder2";
import { describe, expect, it } from "vitest";
import { buildClinicalDocument } from "./clinical-document.js";
import type { ClinicalDocumentInput } from "./types.js";

const input: ClinicalDocumentInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  templateId: { root: "2.16.840.1.113883.3.4424.13.10.1.9", extension: "1.3.2" },
  code: { "@code": "57832-8", "@codeSystem": "2.16.840.1.113883.6.1", "@codeSystemName": "LOINC" },
  title: "Dokument testowy",
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
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
    specialtyCode: "0718_0726",
    specialtyDisplay: "neurologia",
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
      address: { postalCode: "57-100", city: "Strzelin", street: "Mickiewicza", houseNumber: "20" },
    },
  },
  legalAuthenticator: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
  },
};

describe("buildClinicalDocument", () => {
  const result = buildClinicalDocument(input);

  it("returns the document id and date and emits well-formed XML", () => {
    expect(result.documentId).toBe("1234567890123456789012");
    expect(result.documentDate).toBe("20260620120000");
    expect(() => create(result.xml)).not.toThrow();
  });

  it("emits the CDA root, stylesheet and the supplied templateId and code", () => {
    expect(result.xml).toContain('href="CDA_PL_IG_1.3.2.xsl"');
    expect(result.xml).toContain('xsi:type="extPL:ClinicalDocument"');
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.1.9" extension="1.3.2"');
    expect(result.xml).toContain('code="57832-8"');
  });

  it("builds the patient record target", () => {
    expect(result.xml).toContain('extension="62091512345" root="2.16.840.1.113883.3.4424.1.1.616"');
    expect(result.xml).toContain("<given>Jan</given>");
    expect(result.xml).toContain("<family>Kowalski</family>");
    expect(result.xml).toContain('value="mailto:jan@example.pl"');
  });

  it("emits TERYT codes (censusTract) when provided on the address", () => {
    const withTeryt = buildClinicalDocument({
      ...input,
      patient: {
        ...input.patient,
        address: {
          ...input.patient.address,
          terytTerc: "1465011",
          terytSimc: "0918123",
          terytUlic: "18650",
        },
      },
    });
    expect(withTeryt.xml).toContain("<censusTract>TERYT TERC: 1465011</censusTract>");
    expect(withTeryt.xml).toContain("<censusTract>TERYT SIMC: 0918123</censusTract>");
    expect(withTeryt.xml).toContain("<censusTract>TERYT ULIC: 18650</censusTract>");
    // bez pól TERYT nie ma censusTract
    expect(result.xml).not.toContain("censusTract");
  });

  it("builds author org hierarchy, custodian, legal authenticator and participant", () => {
    expect(result.xml).toContain("<family>Nowak</family>");
    expect(result.xml).toContain(
      'extension="12345678901234" root="2.16.840.1.113883.3.4424.2.2.2"',
    );
    expect(result.xml).toContain("extPL:reimbursementRelatedContract");
    expect(result.xml).toContain('assigningAuthorityName="CSIOZ"');
    expect(result.xml).toContain('<signatureCode code="S"');
    expect(result.xml).toContain('<participant typeCode="IND">');
  });

  it("wraps provided sections in structuredBody components with typeCode COMP", () => {
    const withSection = buildClinicalDocument({
      ...input,
      sections: [{ templateId: { "@root": "1.2.3" }, title: "Sekcja" }],
    });
    expect(withSection.xml).toContain('<component typeCode="COMP">');
    expect(withSection.xml).toContain("<title>Sekcja</title>");
  });

  it("escapes special characters via xmlbuilder2", () => {
    const escaped = buildClinicalDocument({ ...input, title: "A & B <x>" });
    expect(escaped.xml).toContain("A &amp; B &lt;x&gt;");
  });
});
