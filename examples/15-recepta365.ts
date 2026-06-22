// Recepta roczna (recepta365): czas trwania kuracji do 365 dni + okno realizacji.
// Lek odbierany partiami przez cały okres. pnpm tsx examples/15-recepta365.ts
import { buildDrugPrescriptionCda, issueDrugPrescription } from "@p1/prescription";
import { prescriptionTransport, previewXml } from "./config.js";
import { baseDrugPrescription, reportPrescription } from "./recepta-base.js";

// recepta365 = recepta na lek + dwa elementy:
//  - dosage.treatmentDuration: czas trwania kuracji (width na effectiveTime),
//  - realizationEndDate: koniec okna realizacji (supply effectiveTime do 365 dni od wystawienia).
const input = baseDrugPrescription({
  effectiveDate: "20260622",
  dosage: {
    periodUnit: "h",
    periodValue: "24", // raz dziennie (institutionSpecified - wymaga jednostki h)
    doseQuantity: "1",
    // Czas trwania kuracji = realny zapas leku (12 op. x 10 tabl. / 1 dziennie = 120 dni).
    treatmentDuration: { value: "120", unit: "d" },
  },
  realizationEndDate: "20270622", // okno realizacji do 365 dni od wystawienia
  payment: { nfzBranch: "07", level: "100%", packageCount: "12" },
});
// recepta365 wymaga opakowania zbiorczego (pharm:asSuperContent).
input.drug.outerPackage = {
  formCode: "30009000", // Pudełko (EDQM)
  formName: "Pudełko",
  capacityUnit: "op.",
  capacityValue: "12",
};
// UWAGA: P1 weryfikuje dane opakowania (GTIN + pojemność, w tym opakowania zbiorczego)
// z Rejestrem Produktów Leczniczych (REG.WER.13453). Pełny e2e wymaga leku, którego
// dane pakowania w RPL wspierają receptę roczną - dane testowego leku mogą nie pasować.

previewXml(buildDrugPrescriptionCda(input).xml);

const transport = prescriptionTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - pominięto wysyłkę.");
  process.exit(0);
}

reportPrescription(await issueDrugPrescription(input, transport));
