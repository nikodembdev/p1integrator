import { create } from "xmlbuilder2";
import { describe, expect, it } from "vitest";
import { buildRehabilitationReferralCda, type RehabilitationReferralInput } from "./document.js";

const input: RehabilitationReferralInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  title: "Skierowanie na rehabilitację leczniczą",
  nfzBranchCode: "07",
  documentId: "1234567890123456789012",
  documentDate: "20260620120000",
  patient: {
    pesel: "62091512345",
    givenNames: ["Jan"],
    familyName: "Kowalski",
    birthDate: "19620915",
    gender: "M",
    address: { city: "Strzelin", postalCode: "57-100", houseNumber: "1" },
  },
  author: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
    specialtyCode: "0718_0726",
    specialtyDisplay: "rehabilitacja medyczna",
    givenNames: ["Piotr"],
    familyName: "Nowak",
    organization: {
      providerExt: "PROV-1",
      providerRoot: "2.16.840.1.113883.3.4424.2.3.1",
      regon14: "12345678901234",
      regon9: "123456789",
      name: "Poradnia rehabilitacyjna",
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
  diagnoses: {
    main: {
      icd10Code: "M54.5",
      icd10Name: "Ból dolnej części grzbietu",
      description: "Ból krzyża",
    },
  },
  procedures: {
    place: { code: "4100", name: "Oddział rehabilitacji" },
    procedures: [{ icd9Code: "93.11", icd9Name: "Ćwiczenia czynne wolne" }],
  },
  contraindications: "Brak przeciwwskazań do rehabilitacji leczniczej",
};

describe("buildRehabilitationReferralCda", () => {
  const result = buildRehabilitationReferralCda(input);

  it("uses the rehabilitation template and structuredBody", () => {
    expect(() => create(result.xml)).not.toThrow();
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.1.29" extension="1.3.2"');
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.2.91"'); // structuredBody
    expect(result.xml).not.toContain("RSUZDR"); // brak kwalifikatorów uzdrowiskowych
  });

  it("reuses shared diagnoses + general procedures and adds the contraindications section", () => {
    expect(result.xml).toContain("<title>Rozpoznania</title>");
    expect(result.xml).toContain("<title>Procedury</title>");
    expect(result.xml).toContain("<title>Przeciwwskazania</title>");
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.3.72"');
    expect(result.xml).toContain('code="48767-8"');
    expect(result.xml).toContain("Brak przeciwwskazań do rehabilitacji leczniczej");
  });
});
