/**
 * Przykład: RECEPTA z UPRAWNIENIEM DODATKOWYM pacjenta (sekcja .3.69).
 *
 * Uruchom:  pnpm tsx examples/04-recepta-uprawnienia-dodatkowe.ts
 *
 * Uprawnienia dodatkowe (RLUD): IB (inwalida wojenny), S (senior), C (ciąża), ZK, AZ,
 * DZ, IW, PO… Podaje się je w polu `entitlements`; libka dobuduje sekcję
 * „Dane o ubezpieczeniu i uprawnieniach". Uprawnienie może mieć dokument potwierdzający.
 * (Pełny kształt wejścia: 03-recepta.ts.)
 */
import { buildDrugPrescriptionCda, issueDrugPrescription } from "@p1/prescription";
import { prescriptionTransport, previewXml } from "./config.js";
import { baseDrugPrescription, reportPrescription } from "./recepta-base.js";

const input = baseDrugPrescription({
  entitlements: [{ code: "IB", document: "Nr leg.: 234/1992" }],
});

previewXml(buildDrugPrescriptionCda(input).xml);

const transport = prescriptionTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) — pominięto wysyłkę.");
  process.exit(0);
}
reportPrescription(await issueDrugPrescription(input, transport));
