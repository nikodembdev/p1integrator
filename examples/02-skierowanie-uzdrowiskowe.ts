// Skierowanie na leczenie uzdrowiskowe (.1.9).
// pnpm tsx examples/02-skierowanie-uzdrowiskowe.ts
// Więcej treści niż ogólne: tryb leczenia, wywiad, badanie, wyniki, korespondencja.
import {
  buildHealthResortReferralCda,
  type HealthResortReferralInput,
  issueHealthResortReferral,
} from "@p1/referral";
import { account, patient, previewXml, referralTransport } from "./config.js";

const input: HealthResortReferralInput = {
  localRoot: account.localRoot,
  title: "Skierowanie na leczenie uzdrowiskowe",
  nfzBranchCode: account.nfzBranch,

  patient: {
    pesel: patient.pesel,
    givenNames: patient.givenNames,
    familyName: patient.familyName,
    birthDate: patient.birthDate,
    gender: patient.gender,
    // Uzdrowisko wymaga kodów TERYT (TERC/SIMC, oraz ULIC gdy podano ulicę) dla Polski.
    address: {
      ...patient.address,
      use: "PST",
      terytTerc: "1465011", // gmina (m.st. Warszawa)
      terytSimc: "0918123", // miejscowość (Warszawa)
      terytUlic: "18650", // ulica
    },
  },

  author: {
    authorExt: account.npwz,
    authorRoot: account.npwzRoot,
    functionCode: "LEK",
    functionDisplay: "Lekarz",
    specialtyCode: "0713",
    specialtyDisplay: "medycyna rodzinna",
    givenNames: account.doctor.givenNames,
    familyName: account.doctor.familyName,
    organization: {
      providerExt: account.podmiotExt,
      providerRoot: account.providerRoot,
      regon14: account.regon14,
      regon9: account.regon9,
      name: account.organizationName,
      phone: account.organizationPhone,
      nfzBranchCode: account.nfzBranch,
      nfzContractNumber: account.nfzContract,
      orgUnitExt: account.orgUnitExt,
      orgUnitName: "Warszawa",
      cellSpecialtyCode: "0010",
      cellSpecialtyName: "Poradnia (gabinet) lekarza POZ",
      address: account.organizationAddress,
    },
  },

  legalAuthenticator: {
    authorExt: account.npwz,
    authorRoot: account.npwzRoot,
    functionCode: "LEK",
    functionDisplay: "Lekarz",
  },

  // Specyfika uzdrowiska:
  treatmentType: "LU", // LU = leczenie uzdrowiskowe (RU = rehabilitacja uzdrowiskowa)
  realizationMode: "TS", // TS = tryb stacjonarny (TA = ambulatoryjny)
  socialHistory: "Pracuje umysłowo, nie pali, używki - nie dotyczy",
  medicalHistory: {
    complaints: "Przewlekłe bóle kręgosłupa lędźwiowego",
    previousSpaTreatment: "NIE",
  },
  physicalExam: {
    vitalSigns: { systolicBP: 135, diastolicBP: 85, weight: 82, height: 178, heartRate: 72 },
    systems: { respiratory: "Wydolny", musculoskeletal: "Ograniczenie ruchomości kręgosłupa" },
    selfCareAbility: true,
    contraindicationsForNaturalResources: false,
    justifications: ["PSR", "LPB"], // uzasadnienia (kody słownikowe)
  },
  diagnoses: {
    main: {
      icd10Code: "M54.5",
      icd10Name: "Ból okolicy lędźwiowo-krzyżowej",
      description: "Przewlekły zespół bólowy kręgosłupa L-S",
    },
  },
  // Uzdrowisko wymaga kompletu wyników: A01 (mocz), C59 (OB), C55 (morfologia).
  labResults: [
    { icd9Code: "A01", icd9Name: "Mocz badanie ogólne", date: "20260601" },
    { icd9Code: "C59", icd9Name: "OB", date: "20260601" },
    { icd9Code: "C55", icd9Name: "Morfologia krwi", date: "20260601" },
  ],
  correspondenceMode: "P", // P = pocztą (E = elektronicznie)
};

previewXml(buildHealthResortReferralCda(input).xml);

const transport = referralTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - pominięto wysyłkę.");
  process.exit(0);
}

const result = await issueHealthResortReferral(input, transport);
if (!result.ok) {
  console.error("❌ Błąd transportu:", result.error.kind, "-", result.error.message);
  process.exit(1);
}
if (result.value.outcome?.major === "urn:csioz:p1:kod:major:Sukces") {
  console.log("✅ Sukces");
  console.log("   kodSkierowania:", result.value.referralCode);
  console.log("   kluczSkierowania:", result.value.referralKey);
} else {
  console.error("❌ P1 odrzucił dokument:", result.value.outcome?.major);
  console.error("  ", result.value.outcome?.message);
  process.exit(1);
}
