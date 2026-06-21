// Recepta pro auctore (dla siebie) / pro familiae (dla rodziny).
// pnpm tsx examples/06-recepta-pro-auctore.ts
// prescriptionType "PA"/"PF" dodaje kwalifikator RRECE; autor podaje wtedy własny
// adres i telefon zamiast organizacji.
// Uwaga: numer recepty pro auctore idzie z osobnej puli OID (2.10.*) zależnej od
// konta, więc pełny e2e (Sukces) wymaga tej puli. Sam dokument buduje się poprawnie.
import { buildDrugPrescriptionCda, issueDrugPrescription } from "@p1/prescription";
import { prescriptionTransport, previewXml } from "./config.js";
import { baseDrugPrescription, reportPrescription } from "./recepta-base.js";

const input = baseDrugPrescription({
  prescriptionType: "PA", // pro auctore (recepta dla samego lekarza)
});

previewXml(buildDrugPrescriptionCda(input).xml);

const transport = prescriptionTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - pominięto wysyłkę.");
  process.exit(0);
}
reportPrescription(await issueDrugPrescription(input, transport));
