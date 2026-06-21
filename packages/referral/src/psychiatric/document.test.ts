import { create } from "xmlbuilder2";
import { describe, expect, it } from "vitest";
import { buildPsychiatricReferralCda, type PsychiatricReferralInput } from "./document.js";

const input: PsychiatricReferralInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  title: "Skierowanie do szpitala psychiatrycznego",
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
    birthplace: { city: "Wrocław", postalCode: "50-001", country: "Polska" },
  },
  author: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
    specialtyCode: "0718_0726",
    specialtyDisplay: "psychiatria",
    givenNames: ["Piotr"],
    familyName: "Nowak",
    organization: {
      providerExt: "PROV-1",
      providerRoot: "2.16.840.1.113883.3.4424.2.3.1",
      regon14: "12345678901234",
      regon9: "123456789",
      name: "Poradnia zdrowia psychicznego",
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
  socialHistory: "Mieszka sam, bez wsparcia rodziny",
  diagnoses: {
    main: {
      icd10Code: "F32.1",
      icd10Name: "Epizod depresyjny umiarkowany",
      description: "Depresja",
    },
  },
  encounter: { cellCode: "2700", cellName: "Oddział dzienny psychiatryczny (ogólny)" },
  reasonForReferral: "Pogorszenie stanu psychicznego, konieczność hospitalizacji",
};

describe("buildPsychiatricReferralCda", () => {
  const result = buildPsychiatricReferralCda(input);

  it("uses the psychiatric template, structuredBody and record target with birthplace", () => {
    expect(() => create(result.xml)).not.toThrow();
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.1.12" extension="1.3.2"');
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.2.41"'); // structuredBody
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.2.40"'); // recordTarget
    expect(result.xml).toContain('classCode="BIRTHPL"');
    expect(result.xml).toContain('classCode="PLC" determinerCode="INSTANCE"');
  });

  it("emits the four mandatory sections; the diagnosis section is narrative-only", () => {
    expect(result.xml).toContain("<title>Wywiad społeczny</title>");
    expect(result.xml).toContain("<title>Rozpoznania</title>");
    expect(result.xml).toContain("<title>Przedmiot skierowania</title>");
    expect(result.xml).toContain("<title>Powód skierowania</title>");
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.4.11"'); // encounter entry
    expect(result.xml).toContain('code="2700"');
    // sekcja .3.20 jest narracyjna - nie zawiera wpisów rozpoznań SNOMED (.4.1)
    expect(result.xml).not.toContain('code="8319008"');
  });
});
