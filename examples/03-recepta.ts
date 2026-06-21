/**
 * Przykład: wystawienie RECEPTY na jeden lek.
 *
 * Uruchom:  pnpm tsx examples/03-recepta.ts
 *
 * `issueDrugPrescription` buduje CDA recepty, podpisuje ją i wysyła jako
 * jednoelementowy pakiet (operacja `zapisPakietuRecept`). W odpowiedzi P1 zwraca
 * kod i klucz pakietu oraz `kluczRecepty` (przyda się do ewentualnego anulowania).
 */
import { randomUUID } from "node:crypto";
import {
  buildDrugPrescriptionCda,
  type DrugPrescriptionInput,
  issueDrugPrescription,
} from "@p1/prescription";
import { account, patient, prescriptionTransport, previewXml } from "./config.js";

// Numer recepty (id dokumentu) = 22 znaki HEX (wymóg formatu P1).
const prescriptionNumber = randomUUID().replace(/-/g, "").toUpperCase().slice(0, 22);

const input: DrugPrescriptionInput = {
  localRoot: account.localRoot,
  prescriptionNumber,
  // Zbiór wersji dokumentu (setId) — root bazuje na węźle OID usługodawcy.
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
  },

  legalAuthenticator: { npwz: account.npwz },

  // Lek: kod + opakowanie (EAN) + postać OPAKOWANIA + skład czynny.
  drug: {
    code: "100000126", // kod leku z Rejestru Produktów Leczniczych
    name: "Zofran",
    availabilityCategory: "Rp", // Rp | Rpw | Rpz | OTC
    packageEan: "05909990805617",
    packageName: "Zofran 8 mg",
    formCode: "30066000", // postać opakowania (EDQM) — np. „Tablet container"
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

  // Dawkowanie (narrację „3 x dziennie po 1 szt." libka wyliczy ze struktury).
  dosage: {
    periodUnit: "h",
    periodValue: "8", // co 8 h → „3 x dziennie"
    doseQuantity: "1",
  },

  // Odpłatność: B | R | 30% | 50% | 100% (pełnopłatne).
  payment: { nfzBranch: account.nfzBranch, level: "100%", packageCount: "1" },
};

previewXml(buildDrugPrescriptionCda(input).xml);

const transport = prescriptionTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) — pominięto wysyłkę.");
  process.exit(0);
}

const result = await issueDrugPrescription(input, transport);
if (!result.ok) {
  console.error("❌ Błąd transportu:", result.error.kind, "-", result.error.message);
  process.exit(1);
}
if (result.value.outcome?.major === "urn:csioz:p1:kod:major:Sukces") {
  console.log("✅ Sukces");
  console.log("   kodPakietu:", result.value.packageCode);
  console.log("   kluczPakietu:", result.value.packageKey);
  console.log("   kluczRecepty:", result.value.prescriptions[0]?.key);
} else {
  console.error("❌ P1 odrzucił dokument:", result.value.outcome?.major);
  console.error("  ", result.value.outcome?.message);
  process.exit(1);
}
