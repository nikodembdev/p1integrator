// Pobieranie recept pacjenta - operacje odczytowe usługi ObslugaReceptyWS.
// pnpm tsx examples/10-pobieranie-recept.ts
// Najpierw wystawiamy receptę, żeby na pewno było co znaleźć; w realnym użyciu
// po prostu wyszukujesz po PESEL pacjenta.
import {
  issueDrugPrescription,
  readPackageAccessData,
  readPrescription,
  readPrescriptionPackage,
  searchIssuerPrescriptions,
  searchPatientPrescriptions,
  searchPatientPrescriptionsExtended,
} from "@p1/prescription";
import { account, patient, prescriptionTransport } from "./config.js";
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

// 3) Rozszerzone wyszukiwanie ze stronicowaniem - obejście limitu wyników P1
// (zwraca też łączną liczbę pasujących recept w `totalCount`).
const extended = await searchPatientPrescriptionsExtended(
  {
    pesel: patient.pesel,
    status: "WYSTAWIONA",
    paging: { pageSize: 5, pageNumber: 0, sort: "MALEJACO", includeCount: true },
  },
  transport,
);
if (extended.ok) {
  console.log(
    `\n✅ Rozszerzone wyszukiwanie: ${extended.value.prescriptions.length} na stronie` +
      ` (łącznie ${extended.value.totalCount ?? "?"})`,
  );
  for (const p of extended.value.prescriptions) {
    console.log(`   - ${p.drugName ?? "?"} | ${p.status} | klucz: ${p.prescriptionKey}`);
  }
}

// 4) Wyszukanie z perspektywy wystawiającego (np. po NPWZ lekarza).
const issuer = await searchIssuerPrescriptions(
  {
    practitionerNpwz: account.npwz,
    issuedFrom: new Date(Date.now() - 15 * 60 * 1000),
    issuedTo: new Date(Date.now() + 60 * 1000),
  },
  transport,
);
if (issuer.ok) {
  console.log(
    `\n✅ Recepty wystawiającego (NPWZ ${account.npwz}): ${issuer.value.prescriptions.length}`,
  );
}

// 5) Dane dostępowe pakietu (klucz + kod pakietu i klucze recept) po kluczu recepty.
const access = await readPackageAccessData(first.prescriptionKey, transport);
if (access.ok) {
  console.log(
    `\n✅ Dane dostępowe pakietu: klucz=${access.value.packageKey ?? "?"}` +
      ` kod=${access.value.packageCode ?? "?"} recept=${access.value.prescriptions.length}`,
  );
}

// 6) Odczyt całego pakietu (wszystkie recepty z treścią CDA) po kluczu pakietu.
if (issued.ok && issued.value.packageKey) {
  const pkg = await readPrescriptionPackage(issued.value.packageKey, transport);
  if (pkg.ok) {
    console.log(`\n✅ Pakiet zawiera recept: ${pkg.value.prescriptions.length}`);
  }
}

// Operacje realizacyjne (odczytStanuRealizacjiRecepty, dokumenty realizacji,
// odczytKluczy przez e-Dowód) wymagają roli realizatora - konto wystawiającego
// dostanie na nie błąd `brakUprawnienPodmiotu`, dlatego nie wołamy ich tutaj.
