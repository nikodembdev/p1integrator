import { describe, expect, it } from "vitest";
import { buildIpomCancellationCda, type IpomCancellationInput } from "./anulowanie.js";

const input: IpomCancellationInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  cancellationNumber: "9999999999999999999999",
  effectiveDate: "20260623120000",
  nfzBranch: "07",
  cancelled: {
    documentId: "1234567890123456789012",
    documentSetId: "1234567890123456789012",
    versionNumber: 1,
    issuedDate: "22.06.2026",
  },
  patient: {
    pesel: "40010151673",
    givenNames: ["Sylwester"],
    familyName: "Senior",
    birthDate: "19400101",
    gender: "M",
    address: { city: "Warszawa", postalCode: "01-134", street: "Odkryta", houseNumber: "41" },
  },
  author: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
    specialtyCode: "0718",
    specialtyDisplay: "neurologia",
    givenNames: ["Piotr"],
    familyName: "Nowak",
    organization: {
      providerExt: "000000000000",
      providerRoot: "2.16.840.1.113883.3.4424.2.3.1",
      regon14: "00000000000000",
      regon9: "000000000",
      name: "PRZYCHODNIA EUROMEDI",
      phone: "22-1111123",
      address: { postalCode: "57-100", city: "Strzelin", street: "Mickiewicza", houseNumber: "20" },
      nfzBranchCode: "07",
      nfzContractNumber: "123456",
    },
  },
  authorSpecialtyCode: "0718",
  authorSpecialtyName: "neurologia",
  legalAuthenticator: {
    authorExt: "1234567",
    authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK",
    functionDisplay: "Lekarz",
  },
};

describe("buildIpomCancellationCda", () => {
  it("buduje dokument anulujący (.10.1.14) z kodem 08.80", () => {
    const { xml, cancellationNumber } = buildIpomCancellationCda(input);
    expect(cancellationNumber).toBe("9999999999999999999999");
    expect(xml).toContain(
      'templateId root="2.16.840.1.113883.3.4424.13.10.1.14" extension="1.3.2"',
    );
    expect(xml).toContain('code="08.80"');
    expect(xml).toContain("<title>Dokument anulujący</title>");
  });

  it("odnosi się do anulowanego planu przez relatedDocument RPLC (root .26)", () => {
    const { xml } = buildIpomCancellationCda(input);
    expect(xml).toContain('<relatedDocument typeCode="RPLC">');
    expect(xml).toContain(
      'extension="1234567890123456789012" root="2.16.840.1.113883.3.4424.2.7.999.26.1"',
    );
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.2.7.999.26.2"');
  });

  it("ustawia versionNumber dokumentu anulującego na oryginał + 1", () => {
    const { xml } = buildIpomCancellationCda(input);
    expect(xml).toContain('<versionNumber value="2"/>');
    expect(xml).toContain('<versionNumber value="1"/>'); // parentDocument
  });

  it("zawiera sekcję danych dokumentu anulowanego z identyfikatorem", () => {
    const { xml } = buildIpomCancellationCda(input);
    expect(xml).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.27"');
    expect(xml).toContain("Dane dokumentu anulowanego");
    expect(xml).toContain("Indywidualny Plan Opieki Medycznej");
    expect(xml).toContain("1234567890123456789012");
  });

  it("generuje numer dokumentu anulującego, gdy nie podano", () => {
    const variant = { ...input };
    delete (variant as { cancellationNumber?: string }).cancellationNumber;
    const { cancellationNumber } = buildIpomCancellationCda(variant);
    expect(cancellationNumber).toMatch(/^\d{10,}$/);
  });

  it("dla harmonogramu (documentKind=schedule) odnosi się do root .27", () => {
    const { xml } = buildIpomCancellationCda({ ...input, documentKind: "schedule" });
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.2.7.999.27.1"');
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.2.7.999.27.2"');
    expect(xml).not.toContain('root="2.16.840.1.113883.3.4424.2.7.999.26.1"');
  });
});
