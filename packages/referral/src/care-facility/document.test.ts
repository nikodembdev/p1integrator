import { create } from "xmlbuilder2";
import { describe, expect, it } from "vitest";
import { buildCareFacilityReferralCda, type CareFacilityReferralInput } from "./document.js";

const input: CareFacilityReferralInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  title: "Skierowanie do zakładu pielęgnacyjno-opiekuńczego",
  nfzBranchCode: "07",
  documentId: "1234567890123456789012",
  documentDate: "20260620120000",
  patient: {
    pesel: "62091512345",
    givenNames: ["Jan"],
    familyName: "Kowalski",
    birthDate: "19620915",
    gender: "M",
    phone: "48-71-1234567",
    address: { city: "Strzelin", postalCode: "57-100", houseNumber: "1" },
  },
  author: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
    specialtyCode: "0718_0726",
    specialtyDisplay: "geriatria",
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
  currentMedication: "Leczenie przeciwbólowe i przeciwzakrzepowe",
  barthelScore: "40 punktów — pacjent wymaga znacznej pomocy",
  encounter: {
    cellCode: "5160",
    cellName: "Zakład/Oddział pielęgnacyjno-opiekuńczy",
    priority: "R",
  },
  annotation: "Pacjent po udarze, wymaga całodobowej opieki pielęgniarskiej",
};

describe("buildCareFacilityReferralCda", () => {
  const result = buildCareFacilityReferralCda(input);

  it("uses the care-facility template, transfer-of-care code and record target .2.36", () => {
    expect(() => create(result.xml)).not.toThrow();
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.1.10" extension="1.3.2"');
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.2.37"'); // structuredBody
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.2.36"'); // recordTarget
    expect(result.xml).toContain('code="34140-4"');
    expect(result.xml).toContain('code="02.12"'); // KLAS_DOK_P1: prośba o objęcie opieką
  });

  it("emits the four mandatory sections with a prioritised requested encounter", () => {
    expect(result.xml).toContain("<title>Dotychczasowe leczenie</title>");
    expect(result.xml).toContain("<title>Skala Barthel</title>");
    expect(result.xml).toContain("<title>Przedmiot skierowania</title>");
    expect(result.xml).toContain("<title>Uwagi</title>");
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.4.9"'); // encounter entry
    expect(result.xml).toContain('code="5160"');
    expect(result.xml).toContain('code="R" codeSystem="2.16.840.1.113883.5.7"'); // priorityCode
  });
});
