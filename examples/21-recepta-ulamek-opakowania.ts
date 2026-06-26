// Recepta na UŁAMEK opakowania - gdy lekarz potrzebuje mniej niż całe zarejestrowane
// opakowanie (klasyczny case: 1 ampułka z opakowania po 10 amp., np. Dexaven).
// Mechanizm: liczba opakowań do wydania (payment.packageCount → <quantity> w supply)
// jest niezależna od pojemności opakowania ze słownika i może być ułamkiem:
// 1 szt. z opakowania po 10 = 0.1 opakowania. Aptekarz wydaje wtedy 1 sztukę.
// pnpm tsx examples/21-recepta-ulamek-opakowania.ts
//
// UWAGA 1: separator dziesiętny MUSI być kropką ("0.1"). P1 rzutuje quantity na xs:double,
// więc przecinek ("0,1") wywala walidację Schematron (FORG0001). Libka wstawia wartość
// dosłownie - kontrola formatu jest po stronie wywołującego.
//
// UWAGA 2: P1 weryfikuje GTIN + pojemność opakowania wobec RPL (REG.WER.13453), więc lek
// musi być realnym, zarejestrowanym produktem. Tu izolujemy JEDNĄ zmienną: bierzemy
// sprawdzony (dający Sukces e2e) lek bazowy Zofran 8 mg (opak. 10 tabl.) i zmieniamy
// WYŁĄCZNIE packageCount na 0.1 (= 1 tabl. z 10), żeby jednoznacznie sprawdzić, czy P1
// przyjmuje ułamek. Dla realnego Dexavenu podstaw jego dane z RPL (GTIN + postać "amp." +
// pojemność) - mechanizm ułamkowej liczby opakowań jest identyczny.
import { buildDrugPrescriptionCda, issueDrugPrescription } from "@p1/prescription";
import { prescriptionTransport, previewXml } from "./config.js";
import { baseDrugPrescription, reportPrescription } from "./recepta-base.js";

const input = baseDrugPrescription({
  // jedyna różnica wobec recepty bazowej: 1/10 opakowania zamiast całego
  payment: { nfzBranch: "07", level: "100%", packageCount: "0.1" },
});

previewXml(buildDrugPrescriptionCda(input).xml);

const transport = prescriptionTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - pominięto wysyłkę.");
  process.exit(0);
}

const result = await issueDrugPrescription(input, transport);
reportPrescription(result);
