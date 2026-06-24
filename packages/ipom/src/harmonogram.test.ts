import { describe, expect, it } from "vitest";
import { buildIpomScheduleCda } from "./harmonogram.js";
import type { IpomScheduleInput } from "./types.js";

const baseInput: IpomScheduleInput = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.999",
  providerOrganizationId: "1099",
  documentId: "1234567890123456789012",
  documentDate: "20260623120000",
  plan: { documentId: "PLAN12345", documentSetId: "PLAN12345", versionNumber: 1 },
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
  diagnoses: [{ code: "E11.0", name: "Cukrzyca" }],
  education: {
    dietaryCount: 3,
    nursingCount: 6,
    dietaryRealizations: [{ status: "ZRL", date: "20260115" }],
  },
  controlVisits: [
    {
      kind: "INTERWAL",
      planLabel: "Co 3 mies.",
      period: { value: "3", unit: "mo" },
      realizations: [{ status: "ZPL", date: "20260217" }, { status: "NZPL" }],
    },
  ],
};

describe("buildIpomScheduleCda", () => {
  it("buduje nagłówek harmonogramu (.10.1.42, root .27, kod 00.95, wrapper .2.108)", () => {
    const { xml } = buildIpomScheduleCda(baseInput);
    expect(xml).toContain(
      'templateId root="2.16.840.1.113883.3.4424.13.10.1.42" extension="1.3.2"',
    );
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.2.7.999.27.1"');
    expect(xml).toContain('root="2.16.840.1.113883.3.4424.2.7.999.27.2"');
    expect(xml).toContain('code="00.95"');
    expect(xml).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.2.108"');
    expect(xml).toContain("Indywidualny Plan Opieki Medycznej - Harmonogram");
  });

  it("buduje sekcje wymagane harmonogramu (174/175/182/184/39)", () => {
    const { xml } = buildIpomScheduleCda(baseInput);
    expect(xml).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.174"');
    expect(xml).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.175"');
    expect(xml).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.182"');
    expect(xml).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.184"');
    expect(xml).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.39"');
  });

  it("dodaje status realizacji zlecenia (SRZ) z datą i kodem StatusRealizacji", () => {
    const { xml } = buildIpomScheduleCda(baseInput);
    expect(xml).toContain('code="SRZ"');
    expect(xml).toContain('code="ZRL" codeSystem="2.16.840.1.113883.3.4424.13.5.13.5"');
    expect(xml).toContain('<effectiveTime value="20260115"/>');
    // NZPL bez daty -> moodCode INT
    expect(xml).toContain('code="NZPL"');
  });

  it("sekcja Załączniki odnosi się do dokumentu planu (externalDocument, root .26)", () => {
    const { xml } = buildIpomScheduleCda(baseInput);
    expect(xml).toContain("<externalDocument>");
    expect(xml).toContain('extension="PLAN12345" root="2.16.840.1.113883.3.4424.2.7.999.26.1"');
    expect(xml).toContain('<reference value="#IPOMDOC"/>');
  });

  it("emituje sekcje opcjonalne tylko gdy są dane", () => {
    const { xml } = buildIpomScheduleCda(baseInput);
    expect(xml).not.toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.183"');
    expect(xml).not.toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.185"');
    const withTests = buildIpomScheduleCda({
      ...baseInput,
      diagnosticTests: [
        {
          kind: "lab",
          code: "C55",
          name: "Morfologia",
          schedule: { kind: "INTERWAL", label: "Co 1 mies.", period: { value: "1", unit: "mo" } },
          realizations: [{ status: "ZRL", date: "20260115" }],
        },
      ],
    }).xml;
    expect(withTests).toContain('templateId root="2.16.840.1.113883.3.4424.13.10.3.183"');
    expect(withTests).toContain('code="ZOWB"');
  });
});
