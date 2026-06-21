import { describe, expect, it } from "vitest";
import { buildMedicalEventEncounter, ZM_SYSTEM } from "./encounter.js";
import { buildMedicalEventPatient, PL_PATIENT_PESEL, toFhirGender } from "./patient.js";

const encounterInput = {
  identifierSystem: "urn:oid:2.16.840.1.113883.3.4424.2.7.000000927722.15.1",
  identifierValue: "11111111-1111-1111-1111-111111111111",
  type: { code: "4", display: "Porada" },
  patient: {
    reference: "Patient/540",
    pesel: "40010151673",
    display: "SYLWESTER SENIOR",
    nfzBranch: "07",
  },
  practitioner: { npwz: "4727124", display: "Adam713 Leczniczy", functionCode: "11" },
  organization: { identifier: "000000927722", payorBranch: "07" },
  location: { identifier: "000000927722-001" },
  period: { start: "2026-06-21T10:00:00+02:00", end: "2026-06-21T10:30:00+02:00" },
};

describe("buildMedicalEventEncounter", () => {
  const json = JSON.stringify(buildMedicalEventEncounter(encounterInput));

  it("buduje Encounter z profilem PLMedicalEvent, statusem i typem zdarzenia", () => {
    expect(json).toContain('"resourceType":"Encounter"');
    expect(json).toContain(ZM_SYSTEM.PROFILE_MEDICAL_EVENT);
    expect(json).toContain('"status":"finished"');
    expect(json).toContain('"code":"4"');
    expect(json).toContain('"display":"Porada"');
  });

  it("subject ma referencję, PESEL i ubezpieczenie; participant NPWZ; serviceProvider podmiot", () => {
    expect(json).toContain('"reference":"Patient/540"');
    expect(json).toContain(`${ZM_SYSTEM.PESEL}`);
    expect(json).toContain('"value":"40010151673"');
    expect(json).toContain(ZM_SYSTEM.INSURANCE_EXTENSION);
    expect(json).toContain('"value":"4727124"'); // NPWZ
    expect(json).toContain('"value":"000000927722"'); // podmiot
    expect(json).toContain('"value":"000000927722-001"'); // komórka
  });
});

describe("buildMedicalEventPatient / toFhirGender", () => {
  it("mapuje płeć P1 na FHIR", () => {
    expect(toFhirGender("M")).toBe("male");
    expect(toFhirGender("F")).toBe("female");
    expect(toFhirGender("UN")).toBe("unknown");
  });

  it("buduje Patient (PLPatient) z identyfikatorem PESEL", () => {
    const json = JSON.stringify(
      buildMedicalEventPatient({
        identifier: { system: PL_PATIENT_PESEL, value: "40010151673" },
        givenNames: ["Sylwester"],
        familyName: "Senior",
        gender: "male",
        birthDate: "1940-01-01",
      }),
    );
    expect(json).toContain('"resourceType":"Patient"');
    expect(json).toContain(PL_PATIENT_PESEL);
    expect(json).toContain('"family":"Senior"');
    expect(json).toContain('"given":["Sylwester"]');
    expect(json).toContain('"gender":"male"');
  });
});
