# e-recepta

Moduł `@p1/prescription` buduje dokumenty CDA recepty na lek (CDA PL PRE / IHE Pharmacy 1.3.2),
wystawia je do P1 w pakiecie (operacja `zapisPakietuRecept`) oraz anuluje
(`zapisDokumentuAnulowaniaRecepty`). Dokument jest zwalidowany Schematronem P1 i XSD;
ścieżka end-to-end potwierdzona na środowisku integracyjnym (P1 zwraca `Sukces`,
weryfikacja `pozytywny`).

## Dwie warstwy użycia

### 1. Sama budowa CDA (bez sieci)

```ts
import { buildDrugPrescriptionCda } from "@p1/prescription";

const { xml } = buildDrugPrescriptionCda(input);
// → string z dokumentem CDA recepty (do podglądu, walidacji, własnej wysyłki)
```

### 2. Pełne wystawienie do P1

```ts
import { issueDrugPrescription, type PrescriptionTransport } from "@p1/prescription";
import { createXadesDocumentSigner } from "@p1/signing";
import { createNodeHttpClient, parseP12 } from "@p1/transport";

const transport: PrescriptionTransport = {
  context, // CallContext (OID-y podmiotu/użytkownika/miejsca + rola)
  documentSigner, // createXadesDocumentSigner({ certificate: { p12, password } })
  httpClient, // createNodeHttpClient({ tls: { key, cert } }) - mTLS
  wsSecurityCertificate, // parseP12(wssP12, password)
  endpoint, // URL usługi ObslugaReceptyWS (zależny od środowiska)
};

const result = await issueDrugPrescription(input, transport);
if (result.ok) {
  console.log(result.value.packageCode, result.value.packageKey);
  console.log(result.value.prescriptions[0]?.key); // kluczRecepty - potrzebny do anulowania
} else {
  console.error(result.error.kind, result.error.message);
}
```

`issueDrugPrescription` robi całość: budowa CDA → podpis XAdES → pakiet `zapisPakietuRecept`
→ koperta SOAP + WS-Security → wysyłka mTLS → parsowanie `WynikMT` + kodu/klucza pakietu
i kluczy poszczególnych recept. Pod spodem `submitPrescriptionPackage` przyjmuje listę recept
(`{ id, cdaXml }[]`), więc można wysłać wiele recept w jednym pakiecie.

> **Dialekt transportu e-recepty:** usługa używa wersji namespace `v20170510` oraz prefiksu
> atrybutów kontekstu `urn:csioz:p1:erecepta:kontekst:` (inaczej niż e-skierowanie). Obsługuje
> to transport automatycznie - nie trzeba nic ustawiać.

## Dane wejściowe

```ts
const input = {
  localRoot: "2.16.840.1.113883.3.4424.2.7.XXXX", // węzeł OID usługodawcy
  prescriptionNumber: "<22 znaki hex>",            // numer recepty (id) - format z REG.WER.213
  versionSetId: { root: "<wezeł>.2.2", extension: "<numer zbioru wersji>" },
  patient: {
    pesel, givenNames, familyName, gender, birthDate, // YYYYMMDD
    address: { postalCode, city, street?, houseNumber, postCity?, unitId? },
  },
  author: {
    npwz, givenNames, familyName,
    organization: { podmiotExt, regon14, name, phone, address: {...} }, // recepta zwykła
    // dla pro auctore/familiae zamiast organization:
    address?, phone?,
  },
  legalAuthenticator: { npwz },
  drug: {
    code, name,                       // manufacturedMaterial (codeSystem .6.1)
    availabilityCategory,             // "Rp" | "Rpw" | "Rpz" | "OTC"
    packageEan, packageName,          // EAN (GS1) + nazwa opakowania
    formCode, formName,               // POSTAĆ OPAKOWANIA (EDQM, np. "30066000" Tablet container)
    capacityUnit, capacityValue,
    ingredients: [{ numeratorValue, numeratorUnit, denominatorValue, denominatorUnit?, code, name }],
    totalActiveSubstance?,            // wymagane dla Rpw (patrz niżej)
  },
  dosage: {
    periodUnit, periodValue,          // częstotliwość (PIVL), np. "h"/"8" → "3 x dziennie"
    doseQuantity, doseUnit?,          // dawka, np. "1" (+ "szt." domyślnie)
    startDate?, endDate?,             // IVL_TS (od/do)
    repeatNumber?,                    // powtórzenia cyklu
  },
  payment: { nfzBranch, level, packageCount }, // odpłatność + ilość opakowań
  entitlements?: [{ code, document? }],        // uprawnienia dodatkowe (sekcja .3.69)
  prescriptionType?,                 // "ZW" | "PA" | "PF" (domyślnie ZW)
  substitution?,                     // false → "NZ" (nie zamieniać)
  dispenserInfo?,                    // informacja dla osoby wydającej lek
};
```

Pełny, działający przykład: `test/integration/p1-account.ts` (`buildE2ePrescriptionInput`).

> **Blok narracyjny jest liczony ze struktury.** P1 generuje narrację (moc składników,
> dawkowanie) z bloku strukturalnego własnym XSL i porównuje (REG.WER.3252). Builder
> odtwarza ten sam algorytm - nie podaje się tekstu dawkowania/mocy ręcznie.

## Odpłatność i refundacja

`payment.level` to jeden z poziomów słownika **PoziomOdplatnosciZaLeki**:

| Kod    | Znaczenie   |
| ------ | ----------- |
| `B`    | bezpłatne   |
| `R`    | ryczałt     |
| `30%`  | 30% limitu  |
| `50%`  | 50% limitu  |
| `100%` | pełnopłatne |

`displayName` uzupełniany jest automatycznie ze słownika. Akt odpłatności
(poziom + oddział NFZ) jest **zawsze** obecny - lek pełnopłatny to po prostu `level: "100%"`
(P1 wymaga aktu odpłatności zawsze, REG.WER.3222). Na jedną pozycję przypada jeden poziom;
różne poziomy = osobne recepty w pakiecie.

## Uprawnienia dodatkowe

Uprawnienia dodatkowe pacjenta (`entitlements`) generują sekcję
„Dane o ubezpieczeniu i uprawnieniach" (.3.69) z kwalifikatorem **RLUD**:

```ts
entitlements: [{ code: "IB", document: "Nr leg.: 234/1992" }];
```

Dostępne kody: `S` (senior), `C` (ciąża), `IB`, `IW`, `ZK`, `AZ`, `BW`, `CN`, `DN`, `IN`,
`PO`, `WP`, `WE`, `DZ`. Każde uprawnienie wiązane jest z pozycją recepty i może mieć dokument
potwierdzający.

## Warianty

- **pro auctore / pro familiae** (`prescriptionType: "PA" | "PF"`): dodaje kwalifikator
  `RRECE`; autor wymaga `address` + `phone` zamiast `organization`. _Uwaga: numer recepty
  pro auctore pochodzi z osobnej puli OID (root `...2.10.*`) przydzielonej do konta._
- **Rpw (lek z substancją narkotyczną):** `availabilityCategory: "Rpw"` + wymagane
  `drug.totalActiveSubstance` (całkowita dawka substancji czynnej) - builder dodaje supply
  CDSC (.4.80). _Uwaga: lek musi być Rpw w Rejestrze Leków, a wystawiający musi mieć
  uprawnienie do leków narkotycznych._

## Anulowanie

Anulowanie wystawionej recepty wymaga `kluczRecepty` (zwracanego przy wystawieniu) i buduje
osobny dokument anulujący (IHE Nullification .1.14, jak przy skierowaniu):

```ts
import { cancelDrugPrescription } from "@p1/prescription";

const result = await cancelDrugPrescription(
  {
    localRoot,
    cancellationNumber, // <22 znaki hex>
    cancelled: {
      prescriptionNumber, // numer anulowanej recepty
      versionSetId, // zbiór wersji oryginału (dzielony przez dokument anulujący)
      title: "Recepta",
    },
    patient,
    author,
    authorSpecialtyCode: "0713", // specjalność (wymagana przez szablon .2.4)
    legalAuthenticator,
    nfzBranch,
  },
  kluczRecepty, // klucz dostępowy z wystawienia
  transport, // ten sam PrescriptionTransport - inna operacja SOAP wybierana wewnątrz
);
```

Dokument anulujący zastępuje oryginał (`relatedDocument` RPLC - dzieli `setId`,
`versionNumber` = oryginał + 1).

## Pobieranie recept pacjenta

Dwie operacje odczytowe (nie podpisują dokumentu, więc transport może być węższy -
`PrescriptionQueryTransport` to `PrescriptionTransport` bez `documentSigner`):

```ts
import { searchPatientPrescriptions, readPrescription } from "@p1/prescription";

// 1) Lista recept pacjenta (operacja wyszukanieReceptUslugobiorcy).
const search = await searchPatientPrescriptions(
  {
    pesel, // wymagane - PESEL usługobiorcy
    status: "WYSTAWIONA", // opcjonalnie: WYSTAWIONA|ZABLOKOWANA|ZREALIZOWANA|CZESCIOWO_ZREALIZOWANA|ANULOWANA
    issuedFrom, // opcjonalnie Date - dolne ograniczenie daty wystawienia
    issuedTo, // opcjonalnie Date - górne ograniczenie
    practitionerNpwz, // opcjonalnie - filtr po wystawiającym
  },
  transport,
);
if (search.ok) {
  for (const p of search.value.prescriptions) {
    console.log(p.status, p.issuedAt, p.prescriptionKey); // klucz do odczytu
  }
}

// 2) Treść jednej recepty (operacja odczytRecepty) - dokument CDA z base64.
const content = await readPrescription(prescriptionKey, transport);
if (content.ok) console.log(content.value.cdaXml);
```

> **Limit wyników:** P1 odrzuca zbyt szerokie wyszukiwanie biznesowym błędem
> `PrzekroczonaLiczbaWynikow` (HTTP 200, `wynik.major = ...:Blad`). Operacja zwraca
> wtedy `ok` z pustą listą i wypełnionym `outcome` - sprawdzaj `outcome.major` i
> zawężaj kryteria (zakres dat, status). Pełny przykład: `examples/10-pobieranie-recept.ts`.

### Pozostałe operacje odczytowe

Wszystkie przyjmują `PrescriptionQueryTransport` i zwracają `Result<…, P1Error>`:

| Funkcja                              | Operacja SOAP                               | Zastosowanie                                                                           |
| ------------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `searchPatientPrescriptions`         | `wyszukanieReceptUslugobiorcy`              | lista recept pacjenta po PESEL                                                         |
| `searchPatientPrescriptionsExtended` | `rozszerzoneWyszukiwanieReceptUslugobiorcy` | jw. + filtr po nazwie leku i **stronicowanie** (obejście limitu wyników, `totalCount`) |
| `readPatientPrescriptionKeys`        | `odczytKluczyReceptUslugobiorcy`            | same klucze recept pacjenta (wariant z uwierzytelnieniem e-Dowodem)                    |
| `searchIssuerPrescriptions`          | `wyszukanieReceptWystawiajacego`            | recepty z perspektywy wystawiającego (po NPWZ/numerze)                                 |
| `readPrescription`                   | `odczytRecepty`                             | treść jednej recepty (CDA)                                                             |
| `readPrescriptionPackage`            | `odczytPakietuRecept`                       | treść całego pakietu recept (po `kluczPakietuRecept`)                                  |
| `readPackageAccessData`              | `odczytDanychDostepowychPakietuRecept`      | klucz + kod pakietu i klucze/numery recept (po kluczu recepty)                         |
| `readPrescriptionFulfillmentState`   | `odczytStanuRealizacjiRecepty`              | ilości do wydania/wydane i data wydawania                                              |
| `readFulfillmentDocument`            | `odczytDokumentuRealizacjiRecepty`          | treść dokumentu realizacji (CDA) po identyfikatorze                                    |
| `readCancellationDocument`           | `odczytDokumentuAnulowaniaRecepty`          | treść dokumentu anulowania (CDA) po identyfikatorze                                    |
| `searchFulfillmentDocuments`         | `wyszukanieDokumentowRealizacjiRecept`      | lista dokumentów realizacji                                                            |
| `searchCancellationDocuments`        | `wyszukanieDokumentowAnulowaniaRecept`      | lista dokumentów anulowania                                                            |

> **Uprawnienia konta:** operacje realizacyjne/apteczne (`odczytStanuRealizacjiRecepty`,
> `*DokumentowRealizacji*`, `odczytKluczy…` przez e-Dowód) wymagają roli realizatora.
> Konto wystawiającego dostaje na nie SOAP Fault `brakUprawnienPodmiotu` (mapowany na
> `P1AuthorizationError`). Potwierdzone e2e dla roli wystawiającego: wyszukania recept
> (`…ReceptUslugobiorcy`, rozszerzone, `…ReceptWystawiajacego`), `odczytRecepty`,
> `odczytPakietuRecept`, `odczytDanychDostepowychPakietuRecept`.

## Walidacja

- `pnpm tsx scripts/validate-prescription.ts` - recepta przez Schematron P1.
- `pnpm test:conformance` - recepta i anulowanie przez **Schematron + XSD** (`drug-prescription`,
  `drug-cancellation`).
- `pnpm test:e2e` - realne wystawienie i anulowanie na integrację (opt-in: `P1_E2E=1`).
- Smoke: `scripts/smoke-erecepta.ts`, `scripts/smoke-anulowanie-recepty.ts`.

> Walidatory (SEF) i XSD pochodzą z poufnych materiałów P1 i leżą w `.local/` - testy
> konformancji pomijają się, gdy ich brak.
