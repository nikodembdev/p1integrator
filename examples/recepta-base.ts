// Bazowa, poprawna recepta (lek gotowy Zofran, pełnopłatny). Przykłady robią
// baseDrugPrescription({ ... }) i nadpisują tylko swoją różnicę. Pełne wejście: 03-recepta.ts.
import { randomUUID } from "node:crypto";
import type { DrugPrescriptionInput } from "@p1/prescription";
import { account, patient } from "./config.js";

/** Świeży numer recepty (22 znaki HEX - wymóg formatu P1). */
export function newPrescriptionNumber(): string {
  return randomUUID().replace(/-/g, "").toUpperCase().slice(0, 22);
}

/** Kompletna, poprawna recepta; `overrides` nadpisują wybrane pola. */
export function baseDrugPrescription(
  overrides: Partial<DrugPrescriptionInput> = {},
): DrugPrescriptionInput {
  const prescriptionNumber = overrides.prescriptionNumber ?? newPrescriptionNumber();
  return {
    localRoot: account.localRoot,
    versionSetId: { root: `${account.localRoot}.2.2`, extension: prescriptionNumber },
    patient: {
      pesel: patient.pesel,
      givenNames: patient.givenNames,
      familyName: patient.familyName,
      gender: patient.gender,
      birthDate: patient.birthDate,
      address: patient.address,
    },
    author: {
      npwz: account.npwz,
      givenNames: account.doctor.givenNames,
      familyName: account.doctor.familyName,
      organization: {
        podmiotExt: account.podmiotExt,
        regon14: account.regon14,
        name: account.organizationName,
        phone: account.organizationPhone,
        address: account.organizationAddress,
      },
      // dane autora dla recepty pro auctore / pro familiae:
      address: account.organizationAddress,
      phone: account.organizationPhone,
    },
    legalAuthenticator: { npwz: account.npwz },
    drug: {
      code: "100000126",
      name: "Zofran",
      availabilityCategory: "Rp",
      packageEan: "05909990805617",
      packageName: "Zofran 8 mg",
      formCode: "30066000",
      formName: "Tablet container",
      capacityUnit: "tabl.",
      capacityValue: "10",
      ingredients: [
        {
          numeratorValue: "8",
          numeratorUnit: "mg",
          denominatorValue: "1",
          code: "23432",
          name: "Ondansetronum",
        },
      ],
    },
    dosage: { periodUnit: "h", periodValue: "8", doseQuantity: "1" },
    payment: { nfzBranch: account.nfzBranch, level: "100%", packageCount: "1" },
    ...overrides,
    prescriptionNumber,
  };
}

/** Wspólna obsługa wyniku wystawienia recepty (dla zwięzłości przykładów). */
export function reportPrescription(
  result:
    | {
        ok: true;
        value: {
          outcome?: { major?: string; message?: string };
          prescriptions: readonly { key?: string }[];
        };
      }
    | { ok: false; error: { kind: string; message: string } },
): void {
  if (!result.ok) {
    console.error("❌ Błąd transportu:", result.error.kind, "-", result.error.message);
    process.exit(1);
  }
  if (result.value.outcome?.major === "urn:csioz:p1:kod:major:Sukces") {
    console.log("✅ Sukces - kluczRecepty:", result.value.prescriptions[0]?.key);
  } else {
    console.error("❌ P1 odrzucił dokument:", result.value.outcome?.major);
    console.error("  ", result.value.outcome?.message);
    process.exit(1);
  }
}
