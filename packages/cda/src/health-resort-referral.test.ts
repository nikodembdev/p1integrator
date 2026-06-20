import { create } from "xmlbuilder2";
import { describe, expect, it } from "vitest";
import {
  buildHealthResortReferralCda,
  type HealthResortReferralInput,
} from "./health-resort-referral.js";

const input: HealthResortReferralInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  title: "Skierowanie na leczenie uzdrowiskowe",
  treatmentType: "LU",
  realizationMode: "TS",
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
    authorExt: "AUTH-1",
    authorRoot: "2.16.840.1.113883.3.4424.2.7.999.7",
    functionCode: "LEK",
    functionDisplay: "Lekarz / dentysta",
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
      nfzBranchCode: "07",
      nfzContractNumber: "12345678",
      address: { postalCode: "57-100", city: "Strzelin", street: "Mickiewicza", houseNumber: "20" },
    },
  },
  legalAuthenticator: {
    authorExt: "AUTH-1",
    authorRoot: "2.16.840.1.113883.3.4424.2.7.999.7",
    functionCode: "LEK",
    functionDisplay: "Lekarz / dentysta",
  },
  socialHistory: "Szkoła podstawowa, klasa 5",
  medicalHistory: {
    complaints: "Bóle kręgosłupa",
    previousSpaTreatment: "TAK, Ciechocinek 2021",
  },
  diagnoses: {
    main: {
      icd10Code: "I25.2",
      icd10Name: "Stary (przebyty) zawał serca",
      description: "Przebyty zawał mięśnia sercowego",
      bodySide: "LEFT",
    },
    secondary: [
      {
        icd10Code: "I10",
        icd10Name: "Nadciśnienie pierwotne",
        description: "Nadciśnienie tętnicze",
      },
    ],
  },
  physicalExam: {
    vitalSigns: { systolicBP: 140, diastolicBP: 85, weight: 88, height: 190, heartRate: 90 },
    systems: { respiratory: "Wydolny", musculoskeletal: "Ograniczenie ruchomości" },
    selfCareAbility: true,
    contraindicationsForNaturalResources: false,
    justifications: ["PSR", "LPB"],
  },
  labResults: [
    { icd9Code: "A01", icd9Name: "Mocz badanie ogólne", date: "20220608" },
    { icd9Code: "C55", icd9Name: "Morfologia krwi", date: "20220608" },
  ],
  correspondenceMode: "P",
};

describe("buildHealthResortReferralCda", () => {
  const result = buildHealthResortReferralCda(input);

  it("emits well-formed XML keeping the header and document id", () => {
    expect(result.documentId).toBe("1234567890123456789012");
    expect(() => create(result.xml)).not.toThrow();
    expect(result.xml).toContain('extension="62091512345" root="2.16.840.1.113883.3.4424.1.1.616"');
    expect(result.xml).toContain('<signatureCode code="S"');
  });

  it("includes the social history and medical history sections", () => {
    expect(result.xml).toContain("Rodzaj szkoły, klasa:");
    expect(result.xml).toContain("Szkoła podstawowa, klasa 5");
    expect(result.xml).toContain("<title>Wywiad</title>");
    expect(result.xml).toContain("Bóle kręgosłupa");
  });

  it("includes the diagnoses section with ICD-10 codes and SNOMED organizers", () => {
    expect(result.xml).toContain("<title>Rozpoznania</title>");
    expect(result.xml).toContain('code="I25.2" codeSystem="2.16.840.1.113883.6.3"');
    expect(result.xml).toContain('code="I10" codeSystem="2.16.840.1.113883.6.3"');
    expect(result.xml).toContain('code="8319008"'); // principal diagnosis (SNOMED)
    expect(result.xml).toContain('code="85097005"'); // secondary diagnosis (SNOMED)
    expect(result.xml).toContain('code="7771000"'); // left body side
    expect(result.xml).toContain('<reference value="#OBS_1"/>');
  });

  it("includes the physical exam section with vital signs and justifications", () => {
    expect(result.xml).toContain("<title>Badanie przedmiotowe</title>");
    expect(result.xml).toContain('code="8480-6"'); // systolic BP (LOINC)
    expect(result.xml).toContain('unit="mm[Hg]" value="140" xsi:type="PQ"');
    expect(result.xml).toContain('code="PSR" codeSystem="2.16.840.1.113883.3.4424.11.1.300"');
    expect(result.xml).toContain('<reference value="#JUST_1"/>');
  });

  it("includes the lab results section with ICD-9 observations", () => {
    expect(result.xml).toContain("<title>Aktualne wyniki badań</title>");
    expect(result.xml).toContain('code="A01" codeSystem="2.16.840.1.113883.3.4424.11.2.6"');
    expect(result.xml).toContain('<effectiveTime value="20220608"/>');
    expect(result.xml).toContain('<reference value="#OBS_WB_1"/>');
  });

  it("includes the correspondence section with the selected mode", () => {
    expect(result.xml).toContain("<title>Korespondencja z pacjentem</title>");
    expect(result.xml).toContain('code="P" codeSystem="2.16.840.1.113883.3.4424.13.5.11"');
    expect(result.xml).toContain('<reference value="#ACT_1"/>');
  });

  it("omits optional sections when not provided", () => {
    const { socialHistory: _s, medicalHistory: _m, ...minimal } = input;
    const xml = buildHealthResortReferralCda(minimal).xml;
    expect(xml).not.toContain("Rodzaj szkoły, klasa:");
    expect(xml).not.toContain("<title>Wywiad</title>");
    expect(xml).toContain("<title>Rozpoznania</title>");
  });
});
