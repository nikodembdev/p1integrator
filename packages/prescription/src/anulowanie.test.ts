import { create } from "xmlbuilder2";
import { describe, expect, it } from "vitest";
import {
  buildPrescriptionCancellationCda,
  type PrescriptionCancellationInput,
} from "./anulowanie.js";

const base: PrescriptionCancellationInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.1491",
  cancellationNumber: "AA11BB22CC33DD44EE55FF",
  effectiveDate: "20260621120000",
  cancelled: {
    prescriptionNumber: "5369C8FAF459440CB472FB",
    versionSetId: { root: "2.16.840.1.113883.3.4424.2.7.1491.2.2", extension: "ZBIOR1" },
    title: "Recepta",
    issuedDate: "19.06.2026",
  },
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
  authorSpecialtyCode: "0718",
  authorSpecialtyName: "neurologia",
  legalAuthenticator: { npwz: "4727124" },
  nfzBranch: "07",
};

describe("buildPrescriptionCancellationCda", () => {
  it("buduje dokument anulujący IHE .1.14 z kodem 51851-4 i tytułem", () => {
    const { xml } = buildPrescriptionCancellationCda(base);
    expect(() => create(xml)).not.toThrow();
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.13.10.1.14" extension="1.3.2"');
    expect(xml).toContain('code="51851-4"');
    expect(xml).toContain('code="08.80"');
    expect(xml).toContain("<title>Dokument anulujący</title>");
    // id anulowania z puli .2.9
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.2.7.1491.2.9"');
  });

  it("zastępuje oryginał (RPLC, setId dzielony, versionNumber +1)", () => {
    const { xml } = buildPrescriptionCancellationCda(base);
    expect(xml).toContain('typeCode="RPLC"');
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.13.10.2.46"');
    expect(xml).toContain('<versionNumber value="2"/>'); // anulowanie = oryginał (1) + 1
    expect(xml).toContain('<versionNumber value="1"/>'); // parentDocument = oryginał
    // parentDocument id z puli rootRecepty .2.1
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.2.7.1491.2.1"');
    // setId dzielony przez oba (zbiór wersji oryginału)
    expect((xml.match(/extension="ZBIOR1"/g) ?? []).length).toBe(2);
  });

  it("zawiera oddział NFZ (participant .2.19) i sekcję danych anulowanego dokumentu", () => {
    const { xml } = buildPrescriptionCancellationCda(base);
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.13.10.2.19"');
    expect(xml).toContain('extension="07" root="2.16.840.1.113883.3.4424.3.1"');
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.13.10.3.27"');
    expect(xml).toContain("<title>Dane dokumentu anulowanego</title>");
    expect(xml).toContain("5369C8FAF459440CB472FB"); // identyfikator anulowanej recepty
  });

  it("autor zwykły ma representedOrganization, pro auctore — adres+telefon", () => {
    const normal = buildPrescriptionCancellationCda(base).xml;
    expect(normal).toContain("representedOrganization");

    const proAuctore = buildPrescriptionCancellationCda({
      ...base,
      prescriptionType: "PA",
      author: {
        ...base.author,
        address: { postalCode: "00-001", city: "Warszawa", houseNumber: "1" },
        phone: "22-1234567",
      },
    }).xml;
    expect(proAuctore).not.toContain("representedOrganization");
  });

  it("anulowanie pro auctore wymaga adresu i telefonu autora", () => {
    expect(() => buildPrescriptionCancellationCda({ ...base, prescriptionType: "PA" })).toThrow();
  });
});
