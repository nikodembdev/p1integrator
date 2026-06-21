/**
 * Przykład: RECEPTA PRO AUCTORE (dla siebie) / PRO FAMILIAE (dla rodziny).
 *
 * Uruchom:  pnpm tsx examples/06-recepta-pro-auctore.ts
 *
 * `prescriptionType: "PA"` (pro auctore) lub `"PF"` (pro familiae) dodaje kwalifikator
 * RRECE. W tym trybie autor podaje własny adres i telefon zamiast organizacji
 * (libka użyje `author.address` + `author.phone`).
 *
 * UWAGA: numer recepty pro auctore pochodzi z osobnej puli OID (`…2.10.*`) przydzielanej
 * do konta — pełny e2e (Sukces) wymaga tej puli. Sam dokument buduje się poprawnie.
 */
import { buildDrugPrescriptionCda, issueDrugPrescription } from "@p1/prescription";
import { prescriptionTransport, previewXml } from "./config.js";
import { baseDrugPrescription, reportPrescription } from "./recepta-base.js";

const input = baseDrugPrescription({
  prescriptionType: "PA", // pro auctore (recepta dla samego lekarza)
});

previewXml(buildDrugPrescriptionCda(input).xml);

const transport = prescriptionTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) — pominięto wysyłkę.");
  process.exit(0);
}
reportPrescription(await issueDrugPrescription(input, transport));
