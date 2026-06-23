// IPOM - anulowanie planu opieki medycznej: wystawienie planu, a następnie jego
// anulowanie (relatedDocument RPLC). pnpm tsx examples/17-ipom-anulowanie.ts
import {
  buildIpomCda,
  type IpomCancellationInput,
  type IpomInput,
  submitIpomCancellation,
  submitIpomDocument,
} from "@p1/ipom";
import { account, ipomTransport, patient, previewXml } from "./config.js";

const cdaAuthor = {
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
};
const cdaPatient = {
  pesel: patient.pesel,
  givenNames: patient.givenNames,
  familyName: patient.familyName,
  birthDate: patient.birthDate,
  gender: patient.gender,
  address: patient.address,
};
const legalAuthenticator = {
  authorExt: account.npwz,
  authorRoot: account.npwzRoot,
  functionCode: "LEK",
  functionDisplay: "Lekarz",
};

// Minimalny poprawny plan (tylko sekcje wymagane: status, rozpoznania, edukacja, wizyty kontrolne).
const plan: IpomInput = {
  localRoot: account.localRoot,
  providerOrganizationId: account.podmiotExt,
  patient: cdaPatient,
  author: cdaAuthor,
  legalAuthenticator,
  healthStatus: { assessmentDate: "20260620", stratification: "S", summary: "Stan stabilny" },
  diagnoses: [{ code: "E11.0", name: "Cukrzyca" }],
  education: { dietaryCount: 3, nursingCount: 6 },
  controlVisits: [
    { kind: "INTERWAL", planLabel: "Co 3 mies.", period: { value: "3", unit: "mo" } },
  ],
};

const built = buildIpomCda(plan);
previewXml(built.xml);

const transport = ipomTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - pominięto wysyłkę.");
  process.exit(0);
}

// 1. Wystawienie planu.
const issued = await submitIpomDocument(built.xml, transport);
if (!issued.ok) {
  console.error("Błąd transportu (zapis):", issued.error);
  process.exit(1);
}
if (issued.value.outcome?.major !== "urn:csioz:p1:kod:major:Sukces") {
  console.error(
    "P1 odrzucił zapis planu:",
    issued.value.outcome?.major,
    issued.value.outcome?.message,
  );
  process.exit(1);
}
console.log(`\nPlan zapisany (Sukces). id=${built.documentId}`);

// 2. Anulowanie planu (RPLC → wystawiony plan).
const cancellation: IpomCancellationInput = {
  localRoot: account.localRoot,
  nfzBranch: account.nfzBranch,
  cancelled: {
    documentId: built.documentId,
    documentSetId: built.documentId, // setId = id (wersja 1)
    versionNumber: 1,
    issuedDate: "22.06.2026",
  },
  patient: cdaPatient,
  author: cdaAuthor,
  authorSpecialtyCode: "0713", // specjalność wymagana przez szablon dokumentu anulującego
  authorSpecialtyName: "medycyna rodzinna",
  legalAuthenticator,
};

const cancelled = await submitIpomCancellation(cancellation, transport);
if (!cancelled.ok) {
  console.error("Błąd transportu (anulowanie):", cancelled.error);
  process.exit(1);
}
if (cancelled.value.outcome?.major === "urn:csioz:p1:kod:major:Sukces") {
  console.log("Plan anulowany (Sukces).");
} else {
  console.error(
    "P1 odrzucił anulowanie:",
    cancelled.value.outcome?.major,
    cancelled.value.outcome?.message,
  );
  const failed = cancelled.value.rules.filter((r) => r.result && !r.result.endsWith("pozytywny"));
  for (const r of failed) console.error(`• ${r.code} [${r.result}] ${r.description ?? ""}`);
  process.exit(1);
}
