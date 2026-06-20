import { create } from "xmlbuilder2";
import { describe, expect, it } from "vitest";
import { buildLongtermNursingReferralCda, type LongtermNursingReferralInput } from "./document.js";

const input: LongtermNursingReferralInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  title: "Skierowanie na objęcie pielęgniarską opieką długoterminową",
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
    specialtyDisplay: "medycyna rodzinna",
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
  history: "Pacjent unieruchomiony po udarze, wymaga stałej opieki pielęgniarskiej",
  physicalFindings: "Niedowład połowiczy prawostronny, odleżyna okolicy krzyżowej",
  encounter: { cellCode: "2142", cellName: "Pielęgniarska opieka długoterminowa" },
};

describe("buildLongtermNursingReferralCda", () => {
  const result = buildLongtermNursingReferralCda(input);

  it("uses the long-term nursing template, code .34140-4 and record target .2.38", () => {
    expect(() => create(result.xml)).not.toThrow();
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.1.11" extension="1.3.2"');
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.2.39"'); // structuredBody
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.2.38"'); // recordTarget
    expect(result.xml).toContain('code="34140-4"');
  });

  it("emits the three mandatory sections with the requested encounter (.4.10)", () => {
    expect(result.xml).toContain("<title>Wywiad</title>");
    expect(result.xml).toContain("<title>Badanie przedmiotowe</title>");
    expect(result.xml).toContain("<title>Zalecenia lekarskie</title>");
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.4.10"');
    expect(result.xml).toContain('code="2142"');
  });
});
