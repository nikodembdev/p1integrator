/**
 * Przykład: PAKIET WIELU RECEPT w jednym wywołaniu (operacja `zapisPakietuRecept`).
 *
 * Uruchom:  pnpm tsx examples/07-pakiet-wielu-recept.ts
 *
 * `issueDrugPrescription` wysyła jedną receptę; pod spodem działa
 * `submitPrescriptionPackage`, które przyjmuje listę recept `{ id, cdaXml }`. Tu
 * budujemy dwie recepty i wysyłamy je razem. P1 zwraca klucz pakietu oraz klucz
 * każdej recepty (skorelowany z `id`).
 */
import {
  buildDrugPrescriptionCda,
  type DrugPrescriptionInput,
  submitPrescriptionPackage,
} from "@p1/prescription";
import { prescriptionTransport, previewXml } from "./config.js";
import { baseDrugPrescription } from "./recepta-base.js";

// Recepta 1 — Zofran (bazowa).
const recepta1: DrugPrescriptionInput = baseDrugPrescription();

// Recepta 2 — inny lek na tę samą wizytę.
const recepta2: DrugPrescriptionInput = baseDrugPrescription({
  drug: {
    code: "100000200",
    name: "Apap",
    availabilityCategory: "Rp",
    packageEan: "05909990805624",
    packageName: "Apap 500 mg",
    formCode: "30066000",
    formName: "Tablet container",
    capacityUnit: "tabl.",
    capacityValue: "24",
    ingredients: [
      {
        numeratorValue: "500",
        numeratorUnit: "mg",
        denominatorValue: "1",
        code: "11111",
        name: "Paracetamolum",
      },
    ],
  },
  dosage: { periodUnit: "h", periodValue: "12", doseQuantity: "1" },
});

previewXml(buildDrugPrescriptionCda(recepta1).xml);

const transport = prescriptionTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) — pominięto wysyłkę.");
  process.exit(0);
}

const result = await submitPrescriptionPackage(
  [
    { id: 1, cdaXml: buildDrugPrescriptionCda(recepta1).xml },
    { id: 2, cdaXml: buildDrugPrescriptionCda(recepta2).xml },
  ],
  transport,
);

if (!result.ok) {
  console.error("❌ Błąd transportu:", result.error.kind, "-", result.error.message);
  process.exit(1);
}
if (result.value.outcome?.major === "urn:csioz:p1:kod:major:Sukces") {
  console.log("✅ Sukces — kodPakietu:", result.value.packageCode);
  for (const p of result.value.prescriptions) {
    console.log(`   recepta #${p.id}: kluczRecepty = ${p.key}`);
  }
} else {
  console.error("❌ P1 odrzucił pakiet:", result.value.outcome?.major);
  console.error("  ", result.value.outcome?.message);
  process.exit(1);
}
