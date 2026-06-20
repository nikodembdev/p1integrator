# e-skierowanie

Moduł `@p1/referral` buduje dokumenty CDA skierowań (CDA PL IG 1.3.2) i wystawia je do P1
(operacja `zapisDokumentuSkierowania`) oraz anuluje (`zapisDokumentuAnulowaniaSkierowania`).
Każdy typ jest zwalidowany Schematronem P1 i XSD; ścieżka end-to-end potwierdzona na integracji.

## Typy dokumentów

| Typ                   | Builder / Issue                                                            | templateId | Uwagi                                                            |
| --------------------- | -------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| Uzdrowiskowe          | `buildHealthResortReferralCda` / `issueHealthResortReferral`               | `.1.9`     | kwalifikatory RSUZDR/TRSU, wywiad, badanie, wyniki badań         |
| Ogólne                | `buildGeneralReferralCda` / `issueGeneralReferral`                         | `.1.4`     | rozpoznania + procedury (ICD-9)                                  |
| Rehabilitacja         | `buildRehabilitationReferralCda` / `issueRehabilitationReferral`           | `.1.29`    | sekcja „Przeciwwskazania"                                        |
| Psychiatryczne        | `buildPsychiatricReferralCda` / `issuePsychiatricReferral`                 | `.1.12`    | recordTarget z `birthplace`, encounter (komórka)                 |
| Zakład opiekuńczy     | `buildCareFacilityReferralCda` / `issueCareFacilityReferral`               | `.1.10`    | kod `34140-4`, encounter z `priority`, telecom pacjenta wymagany |
| Opieka długoterminowa | `buildLongtermNursingReferralCda` / `issueLongtermNursingReferral`         | `.1.11`    | wywiad, badanie, „Zalecenia lekarskie"                           |
| Choroba zawodowa      | `buildOccupationalDiseaseReferralCda` / `issueOccupationalDiseaseReferral` | `.1.13`    | rozpoznanie z systemu chorób zawodowych, poradnia medycyny pracy |
| **Anulowanie**        | `buildNullificationCda` / `issueNullification`                             | `.1.14`    | osobny dokument IHE, referencja do oryginału                     |

Wszystkie symbole eksportuje `@p1/referral`.

## Dwie warstwy użycia

### 1. Sama budowa CDA (bez sieci)

```ts
import { buildGeneralReferralCda } from "@p1/referral";

const { xml } = buildGeneralReferralCda(input);
// → string z dokumentem CDA (do podglądu, walidacji, własnej wysyłki)
```

### 2. Pełne wystawienie do P1

```ts
import { issueGeneralReferral, type ReferralTransport } from "@p1/referral";

const transport: ReferralTransport = {
  context, // CallContext (OID-y podmiotu/użytkownika/miejsca + rola)
  documentSigner, // createXadesDocumentSigner({ certificate: { p12, password } })
  httpClient, // createNodeHttpClient({ tls: { key, cert } })  — mTLS
  wsSecurityCertificate, // parseP12(wssP12, password)
  endpoint, // URL usługi ObslugaSkierowaniaWS (zależny od środowiska)
};

const result = await issueGeneralReferral(input, transport);
if (result.ok) {
  console.log(result.value.referralCode, result.value.referralKey, result.value.outcome);
} else {
  console.error(result.error.kind, result.error.message);
}
```

Pełny przykład złożenia transportu (certy, podpisywarka): `scripts/smoke-eskierowanie.ts`
oraz [docs/podpisywarka.md](podpisywarka.md).

## Dane wejściowe (wspólny szkielet)

Wszystkie typy dzielą nagłówek; różnią się sekcjami klinicznymi. Skierowanie ogólne:

```ts
const input = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.XXXX",  // węzeł OID usługodawcy (id dokumentów)
  title: "Skierowanie do poradni specjalistycznej",
  nfzBranchCode: "07",
  patient: {
    pesel: "...",
    givenNames: ["Jan"],
    familyName: "Kowalski",
    birthDate: "19620915",            // YYYYMMDD
    gender: "M",                      // "M" | "F" | "UN"
    address: { city, postalCode, houseNumber, street?, use? },
    phone?, email?,                   // telecom (wymagany m.in. dla zakładu opiekuńczego)
    birthplace?: { city?, country? }, // wymagany dla psychiatrycznego
  },
  author: {
    authorExt: "<NPWZ>", authorRoot: "2.16.840.1.113883.3.4424.1.6.2",
    functionCode: "LEK", functionDisplay: "Lekarz",
    specialtyCode: "0713", specialtyDisplay: "medycyna rodzinna",
    givenNames: ["Adam"], familyName: "Leczniczy",
    organization: {
      providerExt, providerRoot, regon14, regon9, name, phone,
      nfzBranchCode, nfzContractNumber, address: { postalCode, city, street, houseNumber },
      // pełna hierarchia (gdy MUŚ tego wymaga):
      orgUnitExt?, orgUnitName?, cellSpecialtyCode?, cellSpecialtyName?,
    },
  },
  legalAuthenticator: { authorExt, authorRoot, functionCode: "LEK", functionDisplay: "Lekarz" },
  diagnoses: {
    main: { icd10Code, icd10Name, description },
    secondary?: [{ icd10Code, icd10Name, description }],
  },
  // pola specyficzne dla typu, np. ogólne:
  procedures: { place: { code, name }, procedures: [{ icd9Code, icd9Name }] },
  attachments?: [...],
  // opcjonalnie: documentId, documentDate, documentSetId, now
};
```

Pełne, działające przykłady wejść każdego typu: `test/integration/fixtures.ts`.

## Specyfika typów (najważniejsze)

- **Uzdrowiskowe (.1.9):** `treatmentType` (LU/RU), `realizationMode` (TS/TA), `medicalHistory`,
  `physicalExam` (vitalSigns + systems + uzasadnienia), `labResults` (wymagane A01/C59/C55),
  `correspondenceMode` (P/E).
- **Psychiatryczne (.1.12):** pacjent wymaga `birthplace`; sekcja rozpoznań jest narracyjna
  (bez wpisów SNOMED); `encounter: { cellCode, cellName }` (specjalność komórki).
- **Zakład opiekuńczy (.1.10):** `title` MUSI być jedną z wartości wymaganych przez Schematron
  (opiekuńczo-leczniczy / pielęgnacyjno-opiekuńczy); pacjent musi mieć `phone`/`email`;
  `encounter` z `priority` ("R"/"UR").
- **Opieka długoterminowa (.1.11):** `title` = „Skierowanie na objęcie pielęgniarską opieką
  długoterminową"; sekcja zaleceń z tytułem „Zalecenia lekarskie".
- **Choroba zawodowa (.1.13):** `diagnosis` w systemie chorób zawodowych; przedmiot skierowania
  to stała poradnia medycyny pracy.

## Miejsce udzielania świadczeń (MUŚ) — uwaga

P1 dopasowuje miejsce świadczeń z dokumentu do rejestracji w CWUd **oraz** do
`idMiejscaPracy` z kontekstu. W CDA buduj pełną hierarchię organizacji
(komórka `.2.3.3` → jednostka `.2.3.2` → podmiot `.2.3.1`) przez pola `orgUnitExt` itd.,
a w kontekście podaj **krótki kod komórki** (np. `001`, root `.2.3.3`). Konkretne wartości
są specyficzne dla konta integracyjnego.

## Anulowanie (Nullification, .1.14)

Osobny, prosty dokument IHE referujący anulowany dokument (`relatedDocument`, RPLC —
dzieli `setId` z oryginałem, `versionNumber` = oryginał + 1).

```ts
import { issueNullification } from "@p1/referral";

const result = await issueNullification({
  localRoot,
  patient: { pesel, givenNames, familyName, internalId? },
  author: { authorExt, authorRoot, functionCode, functionDisplay, givenNames, familyName },
  legalAuthenticator: { authorExt, authorRoot, functionCode, functionDisplay },
  annulledDocument: { idRoot, idExtension, setIdRoot?, setIdExtension?, versionNumber? },
  description: "Powód anulowania",
}, transport);   // ten sam ReferralTransport — inna operacja SOAP wybierana wewnątrz
```

## Walidacja

- `pnpm tsx scripts/validate-referral.ts <typ>` — pojedynczy typ przez Schematron P1.
- `pnpm test:conformance` — wszystkie typy przez **Schematron + XSD** (extPL_r3).
  XSD wyłapuje to, czego Schematron nie sprawdza (np. unikalność `xs:ID`).
- `pnpm test:e2e` — realne wystawienie na integrację (opt-in).

> Walidatory (SEF) i XSD pochodzą z poufnych materiałów P1 i leżą w `.local/` — testy
> konformancji pomijają się, gdy ich brak.
