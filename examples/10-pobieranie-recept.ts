// Pobieranie recept pacjenta: wyszukanie listy (wyszukanieReceptUslugobiorcy)
// i odczyt treści CDA jednej z nich (odczytRecepty).
// pnpm tsx examples/10-pobieranie-recept.ts
// Najpierw wystawiamy receptę, żeby na pewno było co znaleźć; w realnym użyciu
// po prostu wyszukujesz po PESEL pacjenta.
import {
  issueDrugPrescription,
  readPrescription,
  searchPatientPrescriptions,
} from "@p1/prescription";
import { patient, prescriptionTransport } from "./config.js";
import { baseDrugPrescription } from "./recepta-base.js";

const transport = prescriptionTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - przykład wymaga połączenia z P1.");
  process.exit(0);
}

// 0) Wystawiamy receptę, żeby lista nie była pusta (krok pomocniczy do demo).
const issued = await issueDrugPrescription(baseDrugPrescription(), transport);
if (issued.ok && issued.value.outcome?.major === "urn:csioz:p1:kod:major:Sukces") {
  console.log("Wystawiono receptę pomocniczą, kluczRecepty:", issued.value.prescriptions[0]?.key);
}

// 1) Wyszukanie recept pacjenta po PESEL. Pacjent z wieloma receptami przekroczy
// limit wyników P1 (błąd PrzekroczonaLiczbaWynikow), dlatego zawężamy zakres dat -
// tu ostatnie 15 minut, żeby złapać świeżo wystawioną receptę.
const search = await searchPatientPrescriptions(
  {
    pesel: patient.pesel,
    status: "WYSTAWIONA",
    issuedFrom: new Date(Date.now() - 15 * 60 * 1000),
    issuedTo: new Date(Date.now() + 60 * 1000),
  },
  transport,
);
if (!search.ok) {
  console.error("❌ Wyszukanie recept:", search.error.kind, "-", search.error.message);
  process.exit(1);
}
// `wynik` biznesowy: błąd (np. zbyt wiele trafień) mimo HTTP 200.
if (search.value.outcome && search.value.outcome.major !== "urn:csioz:p1:kod:major:Sukces") {
  console.error("❌ P1 zwrócił:", search.value.outcome.major, "-", search.value.outcome.message);
  console.error("   Zawęź kryteria (zakres dat / status).");
  process.exit(1);
}

console.log(`\n✅ Znaleziono recept: ${search.value.prescriptions.length}`);
for (const p of search.value.prescriptions.slice(0, 5)) {
  console.log(
    `   - ${p.status?.padEnd(10)} ${p.issuedAt ?? ""} nr ${p.prescriptionNumber?.extension ?? "?"}` +
      ` (wystawca: ${p.issuerName ?? "?"}) klucz: ${p.prescriptionKey}`,
  );
}

const first = search.value.prescriptions[0];
if (!first) {
  console.log("Brak recept do odczytu.");
  process.exit(0);
}

// 2) Odczyt treści wybranej recepty (CDA) po kluczu z wyszukiwania.
const content = await readPrescription(first.prescriptionKey, transport);
if (!content.ok) {
  console.error("❌ Odczyt recepty:", content.error.kind, "-", content.error.message);
  process.exit(1);
}

console.log(`\n✅ Odczytano receptę ${first.prescriptionKey} (status: ${content.value.status})`);
if (content.value.cdaXml) {
  const lines = content.value.cdaXml.split("\n");
  console.log("- dokument CDA (pierwsze 15 linii) -");
  console.log(lines.slice(0, 15).join("\n"));
  console.log(`... (łącznie ${lines.length} linii, ${content.value.cdaXml.length} znaków)`);
}
