// Recepta roczna (recepta365): czas trwania kuracji do 365 dni + okno realizacji.
// Lek odbierany partiami przez cały okres. pnpm tsx examples/15-recepta365.ts
import { buildDrugPrescriptionCda, issueDrugPrescription } from "@p1/prescription";
import { prescriptionTransport, previewXml } from "./config.js";
import { baseDrugPrescription, reportPrescription } from "./recepta-base.js";

// Potwierdzone e2e na INT (Sukces). Dane leku wzięte 1:1 z testowego Rejestru Produktów
// Leczniczych (INT), bo P1 weryfikuje dane opakowania (GTIN + pojemność) z RPL
// (REG.WER.13453). Euthyrox N 100, 100 tabl.:
//   id produktu (.6.1) = 100122310, GTIN = 05909991051426, wielkość = 100 tabl.
const input = baseDrugPrescription({
  drug: {
    code: "100122310", // identyfikator produktu w RPL (manufacturedMaterial/code, .6.1)
    name: "Euthyrox N 100",
    availabilityCategory: "Rp",
    packageEan: "05909991051426", // GTIN opakowania 100 tabl. (RPL)
    packageName: "Euthyrox N 100",
    formCode: "30066000", // Tablet container (EDQM, pojemnik jednostkowy)
    formName: "Tablet container",
    capacityUnit: "tabl.",
    capacityValue: "100", // pojemność opakowania = 100 tabl. (zgodne z RPL)
    ingredients: [
      {
        numeratorValue: "100",
        numeratorUnit: "µg",
        denominatorValue: "1",
        // Kod substancji czynnej (.6.3) pochodzi ze słownika substancji P1; tu placeholder.
        code: "23432",
        name: "Levothyroxinum natricum",
      },
    ],
    // recepta365 wymaga opakowania zewnętrznego (pharm:asSuperContent).
    // Pojedyncze pudełko mieszczące jeden pojemnik => capacityValue "1" bez jednostki.
    outerPackage: {
      formCode: "30009000", // Pudełko (EDQM)
      formName: "Pudełko",
      capacityValue: "1",
    },
  },
  dosage: {
    periodUnit: "h",
    periodValue: "24", // raz dziennie (institutionSpecified - wymaga jednostki h)
    doseQuantity: "1",
    // Czas trwania kuracji = realny zapas leku (3 op. x 100 tabl. / 1 dziennie = 300 dni).
    treatmentDuration: { value: "300", unit: "d" },
  },
  realizationEndDate: "20270622", // okno realizacji do 365 dni od wystawienia
  effectiveDate: "20260622",
  payment: { nfzBranch: "07", level: "100%", packageCount: "3" },
});

previewXml(buildDrugPrescriptionCda(input).xml);

const transport = prescriptionTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - pominięto wysyłkę.");
  process.exit(0);
}

reportPrescription(await issueDrugPrescription(input, transport));
