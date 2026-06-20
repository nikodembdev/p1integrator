import { create } from "xmlbuilder2";
import { describe, expect, it } from "vitest";
import { buildGeneralReferralCda, type GeneralReferralInput } from "./document.js";

const input: GeneralReferralInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  title: "Skierowanie do szpitala",
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
    specialtyDisplay: "kardiologia",
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
  diagnoses: {
    main: { icd10Code: "I25.2", icd10Name: "Przebyty zawał", description: "Przebyty zawał serca" },
  },
  procedures: {
    place: { code: "4100", name: "Oddział kardiologiczny" },
    procedures: [{ icd9Code: "88.55", icd9Name: "Koronarografia z użyciem jednego cewnika" }],
  },
};

describe("buildGeneralReferralCda", () => {
  const result = buildGeneralReferralCda(input);

  it("uses the general template and structuredBody, without health-resort qualifiers", () => {
    expect(() => create(result.xml)).not.toThrow();
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.1.4" extension="1.3.2"');
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.2.28"'); // structuredBody
    expect(result.xml).not.toContain("RSUZDR"); // brak kwalifikatorów uzdrowiskowych
  });

  it("reuses the shared diagnoses section and adds procedures", () => {
    expect(result.xml).toContain("<title>Rozpoznania</title>");
    expect(result.xml).toContain('code="8319008"'); // SNOMED principal (z common)
    expect(result.xml).toContain("<title>Procedury</title>");
    expect(result.xml).toContain('code="88.55" codeSystem="2.16.840.1.113883.3.4424.11.2.6"');
    expect(result.xml).toContain('code="4100" codeSystem="2.16.840.1.113883.3.4424.11.2.4"');
  });
});
