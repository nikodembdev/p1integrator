# p1integrator

TypeScript SDK ucywilizowujący API polskiej platformy P1 (e-zdrowie).
Zamienia surowe SOAP / CDA / XAdES / WS-Security na czyste, typowane,
dziedzinowe API.

Wczesny etap rozwoju (0.x) — publiczne API jeszcze niestabilne.

## Status modułów

| Moduł                  | Status   | Opis                                                                                                       |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| **e-skierowanie**      | stabilny | 7 typów dokumentów + anulowanie; Schematron P1 + XSD; e2e na integracji (`Sukces` + `kodSkierowania`)      |
| **podpisywarka XAdES** | stabilny | podpis XAdES-BES in-process, bez zewnętrznego serwisu                                                      |
| **e-recepta**          | stabilny | wystawianie (pakiet) + anulowanie, odpłatności, uprawnienia dodatkowe; Schematron P1 + XSD; e2e (`Sukces`) |
| **IPOM**               | stabilny | plan opieki (CDA PL IG 1.3.2.1) + HIPOM + anulowanie + odczyt; SOAP 1.2; e2e (`Sukces`)                    |
| **Patient Summary**    | stabilny | pobranie Karty Pacjenta (PDF / HL7 CDA) przez REST + OAuth2; e2e (dokument zwrócony)                       |
| **Zdarzenia medyczne** | stabilny | rejestracja zdarzeń (porada) FHIR R4; OAuth2 (JWT RFC 7523) + XAdES-BES (Provenance); e2e (HTTP 201)       |
| **EDM**                | beta     | IHE XDS.b — token SAML, ITI-42/18/43/41/57, SZAR, ATNA, SOZ; implementacja kompletna, e2e w toku           |

## Co potrafi (w skrócie)

```ts
import { issueGeneralReferral } from "@p1/referral";
import { createXadesDocumentSigner } from "@p1/signing";
import { createNodeHttpClient, parseP12 } from "@p1/transport";

const result = await issueGeneralReferral(input, {
  context, // kontekst wywołania (OID-y + rola)
  documentSigner: createXadesDocumentSigner({ certificate: { p12, password } }),
  httpClient: createNodeHttpClient({ tls: { key, cert } }), // mTLS
  wsSecurityCertificate: parseP12(wssP12, password),
  endpoint: "https://isus.ezdrowie.gov.pl/services/ObslugaSkierowaniaWS",
});
// result: Result<{ referralCode, referralKey, outcome }, P1Error>
```

`issueXxxReferral` robi całość: budowa CDA → podpis XAdES → koperta SOAP + WS-Security →
wysyłka mTLS → parsowanie `WynikMT`. Dostępna jest też warstwa czystych builderów bez I/O
(`buildXxxReferralCda(input).xml`).

## Architektura (monorepo)

```
packages/
├── core/           # typy domenowe, Result/błędy, porty (DocumentSigner, HttpClient...), kontekst
├── cda/            # typowany builder CDA PL IG 1.3.2 (generyczny buildClinicalDocument)
├── signing/        # podpisywarka XAdES-BES in-process (adapter portu DocumentSigner)
├── transport/      # HttpClient mTLS + koperty SOAP + WS-Security + parser odpowiedzi
├── referral/       # e-skierowanie: typy dokumentów + orkiestracja wysyłki
├── prescription/   # e-recepta: recepta na lek + anulowanie, transport pakietu recept
├── ipom/           # IPOM: plan + harmonogram + anulowanie + odczyt/wyszukanie (SOAP 1.2)
├── medical-events/ # Zdarzenia medyczne: FHIR R4 + OAuth2, Encounter/Condition/Provenance
├── patient-summary/# Patient Summary (Karta Pacjenta): pobranie podsumowania (REST + OAuth2)
└── edm/            # EDM: IHE XDS.b — token SAML, ITI-42/18/43/41/57, SZAR, ATNA, SOZ
```

Wzorzec **porty + adaptery**: czyste buildery i orkiestracja zależą od portów
(`DocumentSigner`, `HttpClient`, ...) wstrzykiwanych przez konsumenta. Szczegóły:
[docs/architektura.md](docs/architektura.md).

## Uruchomienie na środowisku integracyjnym

Środowisko integracyjne P1 (`isus.ezdrowie.gov.pl`) wymaga konta technicznego przydzielonego
przez CSIOZ. Bez niego można budować i walidować dokumenty offline, testy jednostkowe i
konformancyjne nie wymagają sieci.

### Wymagania (z przydziału CSIOZ)

- Trzy pliki `.p12`: cert TLS (mTLS), cert WSS (WS-Security / OAuth2 JWT), cert lekarza (XAdES)
- Dane konta: węzeł OID usługodawcy, identyfikator podmiotu, NPWZ lekarza, dane NFZ/REGON
- Pacjent testowy zarejestrowany w CWUb (gotowy PESEL od CSIOZ — własny PESEL nie przejdzie,
  nawet z poprawną sumą kontrolną)

### Konfiguracja

```sh
cp .env.example .local/p1.env
# wypełnij .local/p1.env danymi z przydziału CSIOZ
# wgraj certyfikaty do .local/certs/<nazwa_podmiotu>/
```

Plik `.local/` jest w `.gitignore` - hasła i certyfikaty nigdy nie trafiają do repo.

Zmienne w `.env.example` są skomentowane; kluczowe:

| Zmienna            | Co to jest                                                    |
| ------------------ | ------------------------------------------------------------- |
| `CERT_PASSWORD`    | hasło do wszystkich trzech`.p12`                              |
| `P1_LOCAL_ROOT`    | węzeł OID usługodawcy (`2.16.840.1.113883.3.4424.2.7.XXXX`)   |
| `P1_PODMIOT_EXT`   | identyfikator biznesowy podmiotu (extension)                  |
| `P1_NPWZ`          | NPWZ lekarza (musi zgadzać się z CWPM)                        |
| `P1_MUS_EXT`       | krótki kod komórki org. (res7, np.`001`) — kontekst wywołania |
| `P1_PATIENT_PESEL` | PESEL pacjenta testowego z CWUb                               |

### Uruchomienie przykładów

```sh
pnpm install
pnpm tsx examples/01-skierowanie-ogolne.ts   # wystawianie skierowania
pnpm tsx examples/03-recepta.ts              # wystawianie recepty
pnpm tsx examples/09-zdarzenie-porada.ts     # zdarzenie medyczne (FHIR)
```

Przykład uruchomiony bez `.local/p1.env` lub bez certów buduje dokument i wypisuje XML
(tryb offline). Z certami wykonuje realne wywołanie i drukuje odpowiedź P1.

### Uwaga: legacy PKCS12

Certyfikaty wydawane przez CSIOZ używają starszego szyfru PKCS12, którego Node.js nie
akceptuje przez `pfx`. Biblioteka obsługuje to transparentnie przez `parseP12`
(`@p1/transport` — node-forge), nie ma potrzeby żadnej dodatkowej konfiguracji.

## Walidacja i testy

- `pnpm test` — testy jednostkowe (offline, w tym podpisywarka self-verify).
- `pnpm test:conformance` — każdy typ dokumentu przez Schematron P1 + XSD (wymaga assetów w `.local/`, inaczej pomijane).
- `pnpm test:e2e` — realny strzał w P1 integrację (opt-in: `P1_E2E=1`, certy w `.local/`).

## Dokumentacja

- [Architektura](docs/architektura.md) — warstwy, porty/adaptery, przepływ żądania, kontekst.
- [e-skierowania](docs/eskierowania.md) — typy dokumentów, budowa CDA, wystawianie, anulowanie.
- [e-recepta](docs/erecepta.md) — recepta na lek, odpłatności, uprawnienia dodatkowe, warianty, anulowanie.
- [IPOM](docs/ipom.md) — plan opieki medycznej, harmonogram, anulowanie, odczyt.
- [Patient Summary](docs/patient-summary.md) — pobranie Karty Pacjenta (REST + OAuth2).
- [Zdarzenia medyczne](docs/zdarzenia.md) — FHIR R4, OAuth2, Encounter/Condition/Provenance.
- [EDM](docs/edm.md) — IHE XDS.b, token SAML, ITI-42/18/43/41/57, SZAR, ATNA, SOZ.
- [Podpisywarka](docs/podpisywarka.md) — podpis XAdES-BES in-process.

## Jak powstawał projekt

Projekt jest pisany z Claude Code jako głównym narzędziem programistycznym. Nie jest to
jednak wyrzucanie promptów i kopiowanie wyników, każdy moduł ma pokrycie testami
jednostkowymi, każdy typ dokumentu przechodzi przez Schematron P1 i XSD, a każdy
moduł jest oznaczany jako stabilny dopiero po potwierdzeniu end-to-end na środowisku
integracyjnym P1. Claude jest tutaj narzędziem do pisania kodu, tak jak IDE czy kompilator,
odpowiedzialność za poprawność i weryfikację leży po stronie autora.
