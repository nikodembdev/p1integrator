// Recepta z uprawnieniem dodatkowym pacjenta (sekcja .3.69).
// pnpm tsx examples/04-recepta-uprawnienia-dodatkowe.ts
// Kody RLUD: IB, S (senior), C (ciąża), ZK, AZ, DZ, IW, PO. Podane w `entitlements`,
// dokładają sekcję "Dane o ubezpieczeniu i uprawnieniach"; mogą mieć dokument.
import { buildDrugPrescriptionCda, issueDrugPrescription } from "@p1/prescription";
import { prescriptionTransport, previewXml } from "./config.js";
import { baseDrugPrescription, reportPrescription } from "./recepta-base.js";

const input = baseDrugPrescription({
  entitlements: [{ code: "IB", document: "Nr leg.: 234/1992" }],
});

previewXml(buildDrugPrescriptionCda(input).xml);

const transport = prescriptionTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - pominięto wysyłkę.");
  process.exit(0);
}
reportPrescription(await issueDrugPrescription(input, transport));
