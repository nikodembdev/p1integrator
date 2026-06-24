// IPOM - operacje odczytowe: wystawienie planu, wyszukanie planów pacjenta i odczyt
// treści CDA po identyfikatorze. pnpm tsx examples/19-ipom-odczyt.ts
import {
  buildIpomCda,
  type IpomInput,
  readIpomPlan,
  searchPatientPlans,
  submitIpomDocument,
} from "@p1/ipom";
import { account, ipomTransport, patient } from "./config.js";

const PESEL_OID = "2.16.840.1.113883.3.4424.1.1.616";

const party = {
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
};

const plan: IpomInput = {
  ...party,
  healthStatus: { assessmentDate: "20260620", stratification: "S", summary: "Stan stabilny" },
  diagnoses: [{ code: "E11.0", name: "Cukrzyca" }],
  education: { dietaryCount: 3, nursingCount: 6 },
  controlVisits: [
    { kind: "INTERWAL", planLabel: "Co 3 mies.", period: { value: "3", unit: "mo" } },
  ],
};

const transport = ipomTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - pominięto.");
  process.exit(0);
}

// 1. Wystawienie planu (żeby było co odczytać). „bladWewnetrzny" na INT bywa
// przejściowy - ponawiamy kilka razy.
const built = buildIpomCda(plan);
let saved = false;
for (let attempt = 0; attempt < 4 && !saved; attempt++) {
  const issued = await submitIpomDocument(built.xml, transport);
  if (issued.ok && issued.value.outcome?.major === "urn:csioz:p1:kod:major:Sukces") {
    saved = true;
  } else {
    console.log(
      `zapis - próba ${attempt + 1}:`,
      issued.ok ? issued.value.outcome?.major : issued.error.message,
    );
  }
}
if (!saved) {
  console.error("Nie udało się zapisać planu.");
  process.exit(1);
}
console.log(`Plan zapisany. id=${built.documentId}`);

// 2. Odczyt treści CDA po identyfikatorze dokumentu (id planu = <localRoot>.26.1 + documentId).
const planOid = { root: `${account.localRoot}.26.1`, extension: built.documentId };
const read = await readIpomPlan(planOid, transport);
if (!read.ok) {
  console.error("Błąd odczytu:", read.error);
  process.exit(1);
}
console.log(`\nOdczyt planu ${planOid.extension}: status=${read.value.status}`);
if (read.value.cdaXml) {
  console.log(`Treść CDA: ${read.value.cdaXml.length} znaków`);
  console.log(read.value.cdaXml.split("\n").slice(0, 4).join("\n"));
}

// 3. Wyszukanie planów usługobiorcy (po PESEL). Uwaga: na środowisku integracyjnym
// usługa wyszukiwania bywa niesprawna (serwer zwraca „Marshalling Error: ... {dokumenty}
// is expected") - obsługujemy to łagodnie.
const search = await searchPatientPlans(
  { patient: { root: PESEL_OID, extension: patient.pesel }, status: "OBOWIAZUJACY", page: 0 },
  transport,
);
if (!search.ok) {
  console.log(`\nWyszukiwanie pominięte (błąd usługi INT): ${search.error.message}`);
} else {
  console.log(`\nZnaleziono planów: ${search.value.totalCount ?? search.value.documents.length}`);
  for (const doc of search.value.documents.slice(0, 5)) {
    console.log(
      `• ${doc.planId?.extension} v${doc.versionNumber} [${doc.status}] wyst. ${doc.issuedAt}`,
    );
  }
}
