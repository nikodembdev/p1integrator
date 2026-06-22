import { describe, expect, it } from "vitest";
import { buildIpomCda } from "./document.js";
import type { IpomInput } from "./types.js";

const baseInput: IpomInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  providerOrganizationId: "1099",
  documentId: "1234567890123456789012",
  documentDate: "20260622120000",
  patient: {
    pesel: "40010151673",
    givenNames: ["Sylwester"],
    familyName: "Senior",
    birthDate: "19400101",
    gender: "M",
    internalId: "1234567",
    address: { city: "Warszawa", postalCode: "01-134", street: "Odkryta", houseNumber: "41" },
  },
  author: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
    specialtyCode: "",
    specialtyDisplay: "",
    givenNames: ["Piotr"],
    familyName: "Nowak",
    organization: {
      providerExt: "000000000000",
      providerRoot: "2.16.840.1.113883.3.4424.2.3.1",
      regon14: "00000000000000",
      regon9: "000000000",
      name: "PRZYCHODNIA EUROMEDI",
      phone: "22-1111123",
      address: {
        postalCode: "00-950",
        city: "Warszawa",
        street: "Marszałkowska",
        houseNumber: "320",
      },
      nfzBranchCode: "07",
      nfzContractNumber: "123456",
    },
  },
  legalAuthenticator: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
  },
  healthStatus: { assessmentDate: "20260620", stratification: "S", summary: "Stan stabilny" },
  diagnoses: [
    { code: "E11.0", name: "Cukrzyca" },
    { code: "E78.0", name: "Hipercholesterolemia" },
  ],
  education: { dietaryCount: 3, nursingCount: 6, otherRecommendations: "Ruch 3x/tydz." },
  controlVisits: [
    { kind: "INTERWAL", planLabel: "Co 3 mies.", period: { value: "3", unit: "mo" } },
  ],
};

describe("buildIpomCda", () => {
  it("buduje nagłówek planu opieki medycznej (.10.1.41 z root .26)", () => {
    const { xml, documentId, documentDate } = buildIpomCda(baseInput);
    expect(documentId).toBe("1234567890123456789012");
    expect(documentDate).toBe("20260622120000");
    expect(xml).toContain(
      'templateId root="2.16.840.1.113883.3.4424.13.10.1.41" extension="1.3.2.1"',
    );
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.2.7.999.26.1"');
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.2.7.999.26.2"');
    expect(xml).toContain("<title>Indywidualny Plan Opieki Medycznej</title>");
    expect(xml).toContain('code="00.94"');
  });

  it("umieszcza providerOrganization w patientRole (recordTarget .2.3)", () => {
    const { xml } = buildIpomCda(baseInput);
    expect(xml).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.2.3"');
    expect(xml).toContain('<providerOrganization classCode="ORG">');
    expect(xml).toContain('extension="1099" root="2.16.840.1.113883.3.4424.2.3.1"');
  });

  it("nie emituje document-level participant (IPOM go nie ma)", () => {
    const { xml } = buildIpomCda(baseInput);
    expect(xml).not.toContain("<participant");
  });

  it("opakowuje structuredBody wrapperem .2.107 (DOCBODY/EVN)", () => {
    const { xml } = buildIpomCda(baseInput);
    expect(xml).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.2.107"');
    expect(xml).toContain('<structuredBody classCode="DOCBODY" moodCode="EVN">');
  });

  it("buduje rozpoznania ICD-10 z narracją i wpisami", () => {
    const { xml } = buildIpomCda(baseInput);
    expect(xml).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.175"');
    expect(xml).toContain('ID="p1_rozpoznanie_icd10_kod_1"');
    expect(xml).toContain('code="E11.0" codeSystem="2.16.840.1.113883.6.3"');
    expect(xml).toContain('code="E78.0"');
  });

  it("buduje wymagane sekcje 174/175/177/180 i pomija opcjonalne bez danych", () => {
    const { xml } = buildIpomCda(baseInput);
    expect(xml).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.174"');
    expect(xml).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.175"');
    expect(xml).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.177"');
    expect(xml).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.180"');
    expect(xml).not.toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.176"');
    expect(xml).not.toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.178"');
    expect(xml).not.toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.179"');
  });

  it("buduje sekcję statusu zdrowotnego z DWOSP i SOPS (.13.5.13.1)", () => {
    const { xml } = buildIpomCda(baseInput);
    expect(xml).toContain('code="DWOSP"');
    expect(xml).toContain('<effectiveTime value="20260620"/>');
    expect(xml).toContain('code="SOPS"');
    expect(xml).toContain('code="S" codeSystem="2.16.840.1.113883.3.4424.13.5.13.1"');
  });

  it("buduje poradę edukacyjną z LPDIET/LPPIEL (value INT)", () => {
    const { xml } = buildIpomCda(baseInput);
    expect(xml).toContain("Porada edukacyjna, zalecenia i postępowanie niefarmakologiczne");
    expect(xml).toContain('code="LPDIET"');
    expect(xml).toContain('value xsi:type="INT" value="3"');
    expect(xml).toContain('code="LPPIEL"');
    expect(xml).toContain('value xsi:type="INT" value="6"');
  });

  it("buduje wizyty kontrolne (ZOWK) z interwałem PIVL_TS", () => {
    const { xml } = buildIpomCda(baseInput);
    expect(xml).toContain('code="ZOWK"');
    expect(xml).toContain('code="INTERWAL" codeSystem="2.16.840.1.113883.3.4424.13.5.13.4"');
    expect(xml).toContain('<period value="3" unit="mo"/>');
  });

  it("emituje farmakoterapię (.176) gdy podano leki", () => {
    const withMeds = buildIpomCda({
      ...baseInput,
      medications: [
        { gtin: "05909990789276", name: "Polocard 150mg", dosage: "2x1", duration: "bezterminowo" },
      ],
    }).xml;
    expect(withMeds).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.176"');
    expect(withMeds).toContain('code="05909990789276" codeSystem="1.3.160"');
    expect(withMeds).toContain("Medication dose");
  });

  it("buduje badania diagnostyczne z ZOWB i spójnymi referencjami", () => {
    const { xml } = buildIpomCda({
      ...baseInput,
      diagnosticTests: [
        {
          kind: "lab",
          code: "C55",
          name: "Morfologia",
          schedule: { kind: "INTERWAL", label: "Co 1 mies.", period: { value: "1", unit: "mo" } },
        },
        {
          kind: "imaging",
          code: "88.769",
          name: "USG brzucha",
          schedule: { kind: "PRZEDNASTWIZ", label: "Przed następną wizytą" },
        },
      ],
    });
    expect(xml).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.178"');
    expect(xml).toContain('code="ZBLAB"');
    expect(xml).toContain('code="ZBOBR"');
    expect(xml).toContain('code="ZOWB"');
    expect(xml).toContain('ID="OBS_ZB_OBR_1"');
    expect(xml).toContain('<reference value="#OBS_ZB_OBR_1"/>');
  });

  it("buduje wizyty specjalistyczne (ZKON + BL)", () => {
    const { xml } = buildIpomCda({
      ...baseInput,
      specialistVisits: [{ specialist: "KARDIO", required: true }],
    });
    expect(xml).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.179"');
    expect(xml).toContain('code="ZKON"');
    expect(xml).toContain('code="KARDIO" codeSystem="2.16.840.1.113883.3.4424.13.5.13.2"');
    expect(xml).toContain('value xsi:type="BL" value="true"');
  });

  it("generuje identyfikator dokumentu, gdy nie podano", () => {
    const input = { ...baseInput };
    delete (input as { documentId?: string }).documentId;
    const { documentId } = buildIpomCda(input);
    expect(documentId).toMatch(/^\d{10,}$/);
  });
});
