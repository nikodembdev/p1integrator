import { create } from "xmlbuilder2";
import { describe, expect, it } from "vitest";
import { buildDrugPrescriptionCda } from "./document.js";
import type { DrugPrescriptionInput } from "./types.js";

const baseInput: DrugPrescriptionInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.1491",
  prescriptionNumber: "00000000000000000001",
  versionSetId: { root: "2.16.840.1.113883.3.4424.2.7.17.2.2", extension: "1" },
  effectiveDate: "20260619",
  patient: {
    pesel: "40010151673",
    givenNames: ["Sylwester"],
    familyName: "Senior",
    gender: "M",
    birthDate: "19400101",
    address: { postalCode: "03-134", city: "Warszawa", street: "Odkryta", houseNumber: "41" },
  },
  author: {
    npwz: "4727124",
    givenNames: ["Adam"],
    familyName: "Leczniczy",
    organization: {
      podmiotExt: "000000927722",
      regon14: "23706493000004",
      name: "Poradnia POZ",
      phone: "22-1111123",
      address: { postalCode: "00-184", city: "Warszawa", street: "Odkryta", houseNumber: "41" },
    },
  },
  legalAuthenticator: { npwz: "4727124" },
  drug: {
    code: "100000126",
    name: "Zofran",
    packageEan: "05909990805617",
    packageName: "Zofran",
    formCode: "30066000",
    formName: "Tablet container",
    capacityUnit: "tabl.",
    capacityValue: "24",
    strengthText: "5 g / 50 ml",
    ingredients: [
      {
        numeratorValue: "5",
        numeratorUnit: "g",
        denominatorValue: "50",
        denominatorUnit: "ml",
        code: "23432",
        name: "Enalaprili maleas",
      },
    ],
  },
  dosage: {
    text: "3 x dziennie po 1 szt.",
    startDate: "20260619",
    endDate: "20261014",
    periodUnit: "h",
    periodValue: "8",
    repeatNumber: "1",
    doseQuantity: "1",
  },
  payment: { nfzBranch: "07", level: "100%", packageCount: "4" },
};

describe("buildDrugPrescriptionCda", () => {
  it("buduje poprawny XML z 3 templateId dokumentu, kodem 57833-6 i 4 kwalifikatorami", () => {
    const { xml } = buildDrugPrescriptionCda(baseInput);
    expect(() => create(xml)).not.toThrow();
    expect(xml).toContain('xmlns:pharm="urn:ihe:pharm"');
    expect(xml).toContain('root="1.3.6.1.4.1.19376.1.9.1.1.1"');
    expect(xml).toContain('root="1.3.6.1.4.1.19376.1.5.3.1.1.1"');
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.13.10.1.3" extension="1.3.2"');
    expect(xml).toContain('code="57833-6"');
    expect(xml).toContain('code="04.01"');
    expect(xml).toContain('code="KDLEK"');
    expect(xml).toContain('code="RLEK"');
    expect(xml).toContain('code="TWREC"');
    expect(xml).toContain('code="TRREC"');
    expect(xml).toContain("<title>Recepta</title>");
  });

  it("buduje nagłówek recepty: recordTarget .2.23, author .2.82 (bez specjalności), legalAuth .2.6", () => {
    const { xml } = buildDrugPrescriptionCda(baseInput);
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.13.10.2.23"');
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.13.10.2.82"');
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.13.10.2.6"');
    // recepta: brak specjalności autora i brak NFZ boundedBy/participant
    expect(xml).not.toContain("SPECIALTY");
    expect(xml).not.toContain("reimbursementRelatedContract");
    expect(xml).not.toContain("associatedEntity");
  });

  it("buduje sekcję Rp .3.4 z lekiem (manufacturedMaterial + pharm pakiet + składnik)", () => {
    const { xml } = buildDrugPrescriptionCda(baseInput);
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.13.10.3.4"');
    expect(xml).toContain('code="57828-6"');
    expect(xml).toContain("<title>Rp</title>");
    expect(xml).toContain('code="100000126"');
    expect(xml).toContain("<pharm:containerPackagedMedicine");
    expect(xml).toContain('code="05909990805617"');
    expect(xml).toContain('codeSystemName="GS1"');
    expect(xml).toContain('<pharm:ingredient classCode="ACTI">');
    expect(xml).toContain("Enalaprili maleas");
  });

  it("buduje supply z refundacją (PUBLICPOL + poziom odpłatności + oddział NFZ)", () => {
    const { xml } = buildDrugPrescriptionCda(baseInput);
    expect(xml).toContain('classCode="SPLY" moodCode="RQO"');
    expect(xml).toContain('code="48768-6"');
    expect(xml).toContain('code="PUBLICPOL"');
    expect(xml).toContain('code="RLPO"');
    expect(xml).toContain('code="100%"');
    expect(xml).toContain('extension="07" root="2.16.840.1.113883.3.4424.3.1"');
  });

  it("emituje akt zakazu zamiany i NZ tylko gdy substitution=false", () => {
    const allowed = buildDrugPrescriptionCda({ ...baseInput, substitution: true }).xml;
    expect(allowed).not.toContain('code="N" codeSystem="2.16.840.1.113883.5.1070"');
    expect(allowed).not.toContain(">NZ<");

    const blocked = buildDrugPrescriptionCda({ ...baseInput, substitution: false }).xml;
    expect(blocked).toContain('code="N" codeSystem="2.16.840.1.113883.5.1070"');
    expect(blocked).toContain(">NZ<");
  });

  it("dodaje akt informacji dla wydającego (FINSTRUCT) tylko gdy podano dispenserInfo", () => {
    const without = buildDrugPrescriptionCda(baseInput).xml;
    expect(without).toContain('code="PINSTRUCT"');
    expect(without).not.toContain('code="FINSTRUCT"');

    const withInfo = buildDrugPrescriptionCda({ ...baseInput, dispenserInfo: "Uwaga" }).xml;
    expect(withInfo).toContain('code="FINSTRUCT"');
  });

  it("uzupełnia displayName poziomu odpłatności ze słownika", () => {
    const xml = buildDrugPrescriptionCda({
      ...baseInput,
      payment: { ...baseInput.payment, level: "R" },
    }).xml;
    // narracja = KOD; strukturalny value = KOD + displayName ze słownika
    expect(xml).toContain('<content ID="p1_odplatnosc_wartosc" styleCode="Bold">R</content>');
    expect(xml).toContain('displayName="ryczałt"');
  });

  it("nie buduje sekcji uprawnień gdy brak entitlements", () => {
    const xml = buildDrugPrescriptionCda(baseInput).xml;
    expect(xml).not.toContain('root="2.16.840.1.113883.3.4424.13.10.3.69"');
    expect(xml).not.toContain('code="RLUD"');
  });

  it("buduje sekcję .3.69 z uprawnieniem dodatkowym (RLUD), powiązaniem pozycji i dokumentem", () => {
    const xml = buildDrugPrescriptionCda({
      ...baseInput,
      entitlements: [{ code: "IB", document: "Nr leg.: 234/1992" }],
    }).xml;
    // sekcja płatników/uprawnień
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.13.10.3.69"');
    expect(xml).toContain("<title>Dane o ubezpieczeniu i uprawnieniach</title>");
    // uprawnienie dodatkowe RLUD = IB
    expect(xml).toContain('code="RLUD"');
    expect(xml).toContain('code="IB" codeSystem="2.16.840.1.113883.3.4424.11.3.1"');
    // narracja uprawnień + dokument
    expect(xml).toContain(">IB</content>");
    expect(xml).toContain("Nr leg.: 234/1992");
    // powiązanie z pozycją recepty (.4.69) wymagane przez Schematron
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.13.10.4.69"');
  });

  it("obsługuje wiele uprawnień (lista kodów w narracji, po jednym akcie)", () => {
    const xml = buildDrugPrescriptionCda({
      ...baseInput,
      entitlements: [{ code: "S" }, { code: "C" }],
    }).xml;
    expect(xml).toContain(">S, C</content>"); // narracja: kody łączone ", "
    expect((xml.match(/code="RLUD"/g) ?? []).length).toBe(2);
  });

  it("recepta pro auctore: kwalifikator RRECE=PA i autor z adresem zamiast organizacji", () => {
    const xml = buildDrugPrescriptionCda({
      ...baseInput,
      prescriptionType: "PA",
      author: {
        ...baseInput.author,
        address: { postalCode: "00-001", city: "Warszawa", street: "Próżna", houseNumber: "1" },
        phone: "22-1234567",
      },
    }).xml;
    expect(xml).toContain('code="RRECE"');
    expect(xml).toContain('code="PA" codeSystem="2.16.840.1.113883.3.4424.13.5.1"');
    // autor pro auctore: brak representedOrganization, jest telecom autora
    expect(xml).not.toContain("representedOrganization");
  });

  it("recepta pro auctore wymaga adresu i telefonu autora", () => {
    expect(() => buildDrugPrescriptionCda({ ...baseInput, prescriptionType: "PA" })).toThrow();
  });

  it("Rpw: dodaje supply CDSC (.4.80) z całkowitą dawką i narrację SPLY_1", () => {
    const xml = buildDrugPrescriptionCda({
      ...baseInput,
      drug: {
        ...baseInput.drug,
        availabilityCategory: "Rpw",
        totalActiveSubstance: {
          code: "05909990351718",
          name: "Buprenorphinum",
          numeratorValue: "0.2",
          numeratorUnit: "mg",
          denominatorValue: "1",
        },
      },
    }).xml;
    expect(xml).toContain('code="Rpw"');
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.13.10.4.80"');
    expect(xml).toContain('code="CDSC"');
    expect(xml).toContain('<reference value="#SPLY_1"/>');
    expect(xml).toContain("Potwierdzono ilość substancji czynnej");
    expect(xml).toContain(">0.2 mg</content>");
  });
});
