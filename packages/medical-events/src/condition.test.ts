import { describe, expect, it } from "vitest";
import { buildMedicalEventCondition, ZM_CONDITION_SYSTEM } from "./condition.js";

describe("buildMedicalEventCondition", () => {
  const json = JSON.stringify(
    buildMedicalEventCondition({
      patient: { reference: "Patient/540", pesel: "40010151673" },
      encounter: { reference: "Encounter/999" },
      location: { identifier: "000000927722-001" },
      diagnosis: { code: "J04.0", display: "Ostre zapalenie krtani" },
      recordedDate: "2026-06-21",
      asserter: { npwz: "4727124", display: "Adam713 Leczniczy", functionCode: "11" },
    }),
  );

  it("buduje Condition (PLMedicalEventDiagnosis) z ICD-10 i referencjami", () => {
    expect(json).toContain('"resourceType":"Condition"');
    expect(json).toContain(ZM_CONDITION_SYSTEM.PROFILE_DIAGNOSIS);
    expect(json).toContain(ZM_CONDITION_SYSTEM.ICD10);
    expect(json).toContain('"code":"J04.0"');
    expect(json).toContain('"reference":"Patient/540"');
    expect(json).toContain('"reference":"Encounter/999"');
  });

  it("domyślnie ustawia kategorię główną i rozpoznającego (NPWZ)", () => {
    expect(json).toContain('"code":"main"');
    expect(json).toContain('"value":"4727124"');
    expect(json).toContain('"recordedDate":"2026-06-21"');
  });
});
