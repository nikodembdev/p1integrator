// Recepta: zakaz zamiany ("NZ"), informacja dla wydającego, lek wieloskładnikowy.
// pnpm tsx examples/05-recepta-nie-zamieniac.ts
// substitution:false -> "NZ" + akt zakazu; dispenserInfo -> akapit dla wydającego;
// wiele pozycji w drug.ingredients -> moc składników liczona w narracji.
import { buildDrugPrescriptionCda, issueDrugPrescription } from "@p1/prescription";
import { prescriptionTransport, previewXml } from "./config.js";
import { baseDrugPrescription, reportPrescription } from "./recepta-base.js";

const input = baseDrugPrescription({
  drug: {
    code: "100000126",
    name: "Lek złożony",
    availabilityCategory: "Rp",
    packageEan: "05909990805617",
    packageName: "Lek złożony 8 mg + 20 mg",
    formCode: "30066000",
    formName: "Tablet container",
    capacityUnit: "tabl.",
    capacityValue: "20",
    ingredients: [
      {
        numeratorValue: "8",
        numeratorUnit: "mg",
        denominatorValue: "1",
        code: "23432",
        name: "Ondansetronum",
      },
      {
        numeratorValue: "20",
        numeratorUnit: "mg",
        denominatorValue: "1",
        code: "34543",
        name: "Hydrochlorothiazidum",
      },
    ],
  },
  substitution: false, // ⬅ „NZ" - nie zamieniać
  dispenserInfo: "Wydać opakowanie oryginalne",
});

previewXml(buildDrugPrescriptionCda(input).xml);

const transport = prescriptionTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - pominięto wysyłkę.");
  process.exit(0);
}
reportPrescription(await issueDrugPrescription(input, transport));
