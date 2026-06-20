import { create } from "xmlbuilder2";
import { describe, expect, it } from "vitest";
import {
  buildOccupationalDiseaseReferralCda,
  type OccupationalDiseaseReferralInput,
} from "./document.js";

const input: OccupationalDiseaseReferralInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  title: "Skierowanie na badanie w związku z podejrzeniem choroby zawodowej",
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
    specialtyDisplay: "medycyna pracy",
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
  occupationHistory: "Spawacz, 20 lat pracy w narażeniu na dymy spawalnicze",
  diagnosis: {
    code: "21",
    name: "Przewlekłe obturacyjne zapalenie oskrzeli",
    description: "Podejrzenie POChP zawodowej",
  },
  occupationalExposure: "Dymy spawalnicze, pyły metali, narażenie przewlekłe",
};

describe("buildOccupationalDiseaseReferralCda", () => {
  const result = buildOccupationalDiseaseReferralCda(input);

  it("uses the occupational-disease template and record target .2.42", () => {
    expect(() => create(result.xml)).not.toThrow();
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.1.13" extension="1.3.2"');
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.2.43"'); // structuredBody
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.2.42"'); // recordTarget
    expect(result.xml).toContain('code="57832-8"');
  });

  it("emits the diagnosis entry (.4.12) and a fixed occupational-medicine encounter (.4.13)", () => {
    expect(result.xml).toContain("<title>Wywiad zawodowy</title>");
    expect(result.xml).toContain("<title>Rozpoznanie choroby zawodowej</title>");
    expect(result.xml).toContain("<title>Czynniki narażenia zawodowego</title>");
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.4.12"'); // diagnosis entry
    expect(result.xml).toContain('codeSystem="2.16.840.1.113883.3.4424.11.1.16"'); // wykaz chorób zawodowych
    expect(result.xml).toContain('root="2.16.840.1.113883.3.4424.13.10.4.13"'); // encounter entry
    expect(result.xml).toContain('code="1160"'); // poradnia medycyny pracy
  });
});
