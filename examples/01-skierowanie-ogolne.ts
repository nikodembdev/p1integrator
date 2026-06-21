// Skierowanie ogólne (do poradni / szpitala).
// pnpm tsx examples/01-skierowanie-ogolne.ts
// Bez certów w .local buduje tylko dokument; z certami wysyła go do P1.
import {
  buildGeneralReferralCda,
  type GeneralReferralInput,
  issueGeneralReferral,
} from "@p1/referral";
import { account, patient, previewXml, referralTransport } from "./config.js";

const input: GeneralReferralInput = {
  localRoot: account.localRoot, // węzeł OID usługodawcy
  title: "Skierowanie do poradni specjalistycznej",
  nfzBranchCode: account.nfzBranch,

  patient: {
    pesel: patient.pesel,
    givenNames: patient.givenNames,
    familyName: patient.familyName,
    birthDate: patient.birthDate, // YYYYMMDD
    gender: patient.gender,
    address: { ...patient.address, use: "PST" },
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
      // pełna hierarchia miejsca udzielania świadczeń (MUŚ):
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

  // Rozpoznania (ICD-10).
  diagnoses: {
    main: { icd10Code: "J45", icd10Name: "Astma oskrzelowa", description: "Astma oskrzelowa" },
  },

  // Przedmiot skierowania: miejsce + procedury (ICD-9).
  procedures: {
    place: { code: "0010", name: "Poradnia (gabinet) lekarza POZ" },
    procedures: [{ icd9Code: "89.00", icd9Name: "Porada lekarska" }],
  },
};

// podgląd samego dokumentu (bez sieci)
previewXml(buildGeneralReferralCda(input).xml);

const transport = referralTransport();
if (!transport) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - pominięto wysyłkę.");
  process.exit(0);
}

const result = await issueGeneralReferral(input, transport);
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
