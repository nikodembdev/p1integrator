// IPOM - harmonogram (HIPOM): wystawienie planu, a następnie powiązanego z nim
// harmonogramu realizacji. pnpm tsx examples/18-ipom-harmonogram.ts
import {
  buildIpomCda,
  type IpomInput,
  type IpomScheduleInput,
  submitIpomDocument,
  submitIpomSchedule,
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
const party = {
  localRoot: account.localRoot,
  providerOrganizationId: account.podmiotExt,
  patient: cdaPatient,
  author: cdaAuthor,
  legalAuthenticator,
};

// Plan, którego dotyczy harmonogram.
const plan: IpomInput = {
  ...party,
  healthStatus: { assessmentDate: "20260620", stratification: "S", summary: "Stan stabilny" },
  diagnoses: [{ code: "E11.0", name: "Cukrzyca" }],
  education: { dietaryCount: 3, nursingCount: 6 },
  controlVisits: [
    { kind: "INTERWAL", planLabel: "Co 3 mies.", period: { value: "3", unit: "mo" } },
  ],
};

const builtPlan = buildIpomCda(plan);
previewXml(builtPlan.xml);

const transport = ipomTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - pominięto wysyłkę.");
  process.exit(0);
}

// 1. Wystawienie planu.
const issuedPlan = await submitIpomDocument(builtPlan.xml, transport);
if (!issuedPlan.ok || issuedPlan.value.outcome?.major !== "urn:csioz:p1:kod:major:Sukces") {
  console.error(
    "Nie udało się zapisać planu:",
    issuedPlan.ok ? issuedPlan.value.outcome?.major : issuedPlan.error,
  );
  process.exit(1);
}
console.log(`\nPlan zapisany (Sukces). id=${builtPlan.documentId}`);

// 2. Harmonogram realizacji powiązany z planem (sekcja Załączniki → plan).
const schedule: IpomScheduleInput = {
  ...party,
  plan: { documentId: builtPlan.documentId, documentSetId: builtPlan.documentId, versionNumber: 1 },
  healthStatus: { assessmentDate: "20260620", stratification: "S", summary: "Stan stabilny" },
  diagnoses: [{ code: "E11.0", name: "Cukrzyca" }],
  education: {
    dietaryCount: 3,
    nursingCount: 6,
    dietaryRealizations: [{ status: "ZRL", date: "20260615" }],
  },
  controlVisits: [
    {
      kind: "INTERWAL",
      planLabel: "Co 3 mies.",
      period: { value: "3", unit: "mo" },
      realizations: [{ status: "ZPL", date: "20260901" }],
    },
  ],
};

const issuedSchedule = await submitIpomSchedule(schedule, transport);
if (!issuedSchedule.ok) {
  console.error("Błąd transportu (harmonogram):", issuedSchedule.error);
  process.exit(1);
}
if (issuedSchedule.value.outcome?.major === "urn:csioz:p1:kod:major:Sukces") {
  console.log("Harmonogram zapisany (Sukces).");
} else {
  console.error(
    "P1 odrzucił harmonogram:",
    issuedSchedule.value.outcome?.major,
    issuedSchedule.value.outcome?.message,
  );
  const failed = issuedSchedule.value.rules.filter(
    (r) => r.result && !r.result.endsWith("pozytywny"),
  );
  for (const r of failed) console.error(`• ${r.code} [${r.result}] ${r.description ?? ""}`);
  process.exit(1);
}
