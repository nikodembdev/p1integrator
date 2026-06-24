// IPOM - Indywidualny Plan Opieki Medycznej (POM). Buduje plan opieki (CDA PL IG
// 1.3.2.1) i wysyła operacją zapisPlanuOpiekiMedycznej. pnpm tsx examples/16-ipom.ts
import { buildIpomCda, type IpomInput, submitIpom } from "@p1/ipom";
import { account, ipomTransport, patient, previewXml } from "./config.js";

const input: IpomInput = {
  localRoot: account.localRoot,
  providerOrganizationId: account.podmiotExt,
  patient: {
    pesel: patient.pesel,
    givenNames: patient.givenNames,
    familyName: patient.familyName,
    birthDate: patient.birthDate,
    gender: patient.gender,
    address: patient.address,
  },
  author: {
    authorExt: account.npwz,
    authorRoot: account.npwzRoot,
    functionCode: "LEK",
    functionDisplay: "Lekarz",
    specialtyCode: "",
    specialtyDisplay: "",
    givenNames: account.doctor.givenNames,
    familyName: account.doctor.familyName,
    organization: {
      providerExt: account.podmiotExt,
      providerRoot: account.providerRoot,
      regon14: account.regon14,
      regon9: account.regon9,
      name: account.organizationName,
      phone: account.organizationPhone,
      address: account.organizationAddress,
      nfzBranchCode: account.nfzBranch,
      nfzContractNumber: account.nfzContract,
    },
  },
  legalAuthenticator: {
    authorExt: account.npwz,
    authorRoot: account.npwzRoot,
    functionCode: "LEK",
    functionDisplay: "Lekarz",
  },

  // Sekcje wymagane: status zdrowotny, rozpoznania, porada edukacyjna, wizyty kontrolne.
  healthStatus: {
    assessmentDate: "20260620", // data oceny <= data wystawienia
    stratification: "S", // S - Stabilny
    summary: "Stan pacjenta stabilny, unormowane wyniki badań diagnostycznych",
  },
  diagnoses: [
    { code: "E11.0", name: "Cukrzyca" },
    { code: "E78.0", name: "Hipercholesterolemia" },
  ],
  education: {
    dietaryCount: 3, // liczba porad dietetycznych w roku (LPDIET, 0-3)
    nursingCount: 6, // liczba porad lekarskich/pielęgniarskich (LPPIEL)
    otherRecommendations:
      "Regularne ćwiczenia fizyczne - minimum 3 razy w tygodniu spacer 60 minut.",
  },
  controlVisits: [
    {
      kind: "POWYKZLECZADAN",
      planLabel: "Po wykonaniu zleconych badań",
      requiredTasks: "Badania cholesterolu",
    },
    { kind: "POOKRCZASIE", planLabel: "Za 1 mies.", quantity: { value: "1", unit: "mo" } },
    { kind: "INTERWAL", planLabel: "Co 3 mies.", period: { value: "3", unit: "mo" } },
  ],

  // Sekcje opcjonalne.
  medications: [
    {
      gtin: "05909990789276",
      name: "Polocard",
      displayName: "Polocard 150mg",
      dosage: "2x1",
      duration: "bezterminowo",
    },
    {
      gtin: "05909997747446",
      name: "Metformina 500mg",
      dosage: "2x1 tabl. rano i wieczorem",
      duration: "przez 90 dni",
    },
  ],
  diagnosticTests: [
    {
      kind: "lab",
      code: "C55",
      name: "Morfologia krwi, z pełnym różnicowaniem granulocytów",
      schedule: { kind: "INTERWAL", label: "Co 1 mies.", period: { value: "1", unit: "mo" } },
    },
    {
      kind: "lab",
      code: "L55",
      name: "Hemoglobina glikowana (HbA1c)",
      schedule: { kind: "DOCZASU", label: "Do 1.12.2026", date: "20261201" },
    },
    {
      kind: "imaging",
      code: "88.769",
      name: "USG brzucha - inne",
      schedule: { kind: "PRZEDNASTWIZ", label: "Przed następną wizytą" },
    },
  ],
  specialistVisits: [
    { specialist: "KARDIO", required: true },
    { specialist: "DIAEND", required: true },
    { specialist: "PULALE", required: false },
  ],
};

previewXml(buildIpomCda(input).xml);

const transport = ipomTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - pominięto wysyłkę.");
  process.exit(0);
}

const result = await submitIpom(input, transport);
if (!result.ok) {
  console.error("Błąd transportu:", result.error);
  process.exit(1);
}

const { verification, rules, outcome } = result.value;
console.log(`\nWynik weryfikacji dokumentu: ${verification ?? "(brak)"}`);
if (outcome)
  console.log(
    `WynikMT: major=${outcome.major} minor=${outcome.minor ?? "-"} ${outcome.message ?? ""}`,
  );
const failed = rules.filter((r) => r.result && !r.result.endsWith("pozytywny"));
if (failed.length === 0) {
  console.log("Wszystkie reguły przeszły (Sukces).");
} else {
  console.log(`\nReguły z problemem (${failed.length}):`);
  for (const r of failed)
    console.log(
      `• ${r.code} [${r.result}] ${r.description ?? ""} ${r.location ? `@ ${r.location}` : ""}`,
    );
}
