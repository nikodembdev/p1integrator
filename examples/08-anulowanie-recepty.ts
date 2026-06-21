/**
 * Przykład: ANULOWANIE recepty (operacja `zapisDokumentuAnulowaniaRecepty`).
 *
 * Uruchom:  pnpm tsx examples/08-anulowanie-recepty.ts
 *
 * Najpierw wystawiamy receptę (żeby mieć co anulować) i pobieramy `kluczRecepty`,
 * a potem `cancelDrugPrescription` buduje dokument anulujący i wysyła go wraz z kluczem.
 * W realnym użyciu klucz recepty pochodzi z wcześniejszego wystawienia.
 */
import { randomUUID } from "node:crypto";
import {
  cancelDrugPrescription,
  type PrescriptionCancellationInput,
  issueDrugPrescription,
} from "@p1/prescription";
import { prescriptionTransport } from "./config.js";
import { baseDrugPrescription } from "./recepta-base.js";

const transport = prescriptionTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) — przykład wymaga połączenia z P1.");
  process.exit(0);
}

// 1) Wystawiamy receptę, którą za chwilę anulujemy.
const recepta = baseDrugPrescription();
const issued = await issueDrugPrescription(recepta, transport);
if (!issued.ok || issued.value.outcome?.major !== "urn:csioz:p1:kod:major:Sukces") {
  console.error("❌ Nie udało się wystawić recepty do anulowania:", JSON.stringify(issued));
  process.exit(1);
}
const kluczRecepty = issued.value.prescriptions[0]?.key ?? "";
console.log("Wystawiono receptę, kluczRecepty:", kluczRecepty);

// 2) Anulujemy ją — wskazujemy oryginał (numer + zbiór wersji) i podajemy klucz.
const cancellation: PrescriptionCancellationInput = {
  localRoot: recepta.localRoot,
  cancellationNumber: randomUUID().replace(/-/g, "").toUpperCase().slice(0, 22),
  cancelled: {
    prescriptionNumber: recepta.prescriptionNumber,
    versionSetId: recepta.versionSetId,
    title: "Recepta",
  },
  patient: recepta.patient,
  author: recepta.author,
  authorSpecialtyCode: "0713", // specjalność (wymagana przez szablon dokumentu anulującego)
  authorSpecialtyName: "medycyna rodzinna",
  legalAuthenticator: recepta.legalAuthenticator,
  nfzBranch: recepta.payment.nfzBranch,
};

const cancelled = await cancelDrugPrescription(cancellation, kluczRecepty, transport);
if (!cancelled.ok) {
  console.error("❌ Błąd transportu:", cancelled.error.kind, "-", cancelled.error.message);
  process.exit(1);
}
if (cancelled.value.outcome?.major === "urn:csioz:p1:kod:major:Sukces") {
  console.log("✅ Recepta anulowana (Sukces)");
} else {
  console.error("❌ P1 odrzucił anulowanie:", cancelled.value.outcome?.major);
  console.error("  ", cancelled.value.outcome?.message);
  process.exit(1);
}
