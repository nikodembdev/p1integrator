# p1integrator

TypeScript SDK ucywilizowujący API polskiej platformy P1 (e-zdrowie).
Zamienia surowe SOAP / CDA / XAdES / WS-Security na czyste, typowane,
dziedzinowe API.

> ⚠️ Wczesny etap rozwoju (0.x) - publiczne API jeszcze niestabilne.

## Status

Legenda: ✅ potwierdzone end-to-end na środowisku integracyjnym P1 (zwrócony `Sukces`) ·
🟡 zaimplementowane, e2e częściowy lub w toku.

- ✅ **e-skierowanie** - 7 typów dokumentów + anulowanie, każdy zwalidowany Schematronem P1 i XSD; **potwierdzone end-to-end** (P1 zwraca `Sukces` + `kodSkierowania`). Zob. [docs/eskierowania.md](docs/eskierowania.md).
- ✅ **e-recepta** - wystawianie (pakiet recept) + anulowanie, odpłatności i uprawnienia dodatkowe, recepta roczna (recepta365), Rpw; operacje odczytowe (wyszukanie po PESEL + odczyt treści CDA); zwalidowane Schematronem P1 i XSD; **potwierdzone end-to-end** (`Sukces`). Zob. [docs/erecepta.md](docs/erecepta.md).
- ✅ **IPOM** (Indywidualny Plan Opieki Medycznej / POM) - plan opieki (CDA PL IG 1.3.2.1) + harmonogram realizacji (HIPOM) + anulowanie + odczyt; binding SOAP 1.2; zwalidowany Schematronem P1; **potwierdzony end-to-end** (`Sukces`; odczyt po identyfikatorze, wyszukanie blokuje błąd marshallingu po stronie INT).
- ✅ **Patient Summary** (Karta Pacjenta) - pobranie podsumowania pacjenta (PDF / HL7 CDA) przez REST + OAuth2; **potwierdzone end-to-end** (zwrócony dokument „Karta pacjenta").
- ✅ **podpisywarka XAdES in-process** - podpis dokumentu bez zewnętrznego serwisu (Java/DSS). Zob. [docs/podpisywarka.md](docs/podpisywarka.md).
- 🟡 **zdarzenia medyczne** - FHIR R4 + OAuth2 (JWT), `Encounter`/`Condition`/`Provenance`; wystawienie zdarzenia „porada" potwierdzone end-to-end, pełen zakres operacji w toku. Zob. [docs/zdarzenia.md](docs/zdarzenia.md).
- 🟡 **EDM** (Elektroniczna Dokumentacja Medyczna) - IHE XDS.b (ITI-42/18/57/41/43) + token SAML; publikacja indeksu i wybrane operacje potwierdzone end-to-end, pozostałe profile w toku. Zob. [docs/edm.md](docs/edm.md).
- 🔴 **e-ZLA (ZUS)** - osobny system (nie P1): symulator + WSDL gabinetowy V4; szkielet, zablokowane na danych testowych.

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
├── core/          # typy domenowe, Result/błędy, porty (DocumentSigner, HttpClient...), kontekst
├── cda/           # typowany builder CDA PL IG 1.3.2 (generyczny buildClinicalDocument)
├── signing/       # podpisywarka XAdES-BES in-process (adapter portu DocumentSigner)
├── transport/     # HttpClient mTLS + koperty SOAP + WS-Security + parser + sendSignedSoap
├── referral/        # e-skierowanie: typy dokumentów + orkiestracja wysyłki
├── prescription/    # e-recepta: wystawianie + anulowanie + odczyty (pakiet recept)
├── ipom/            # IPOM: plan + harmonogram + anulowanie + odczyt (SOAP 1.2)
├── patient-summary/ # Patient Summary (Karta Pacjenta): pobranie podsumowania (REST + OAuth2)
├── medical-events/  # zdarzenia medyczne: FHIR R4 + OAuth2 (JWT)
└── edm/             # EDM: IHE XDS.b (ITI-42/18/57/41/43) + token SAML
```

Wspólny ogon wywołania SOAP (koperta → podpis WS-Security → mTLS → parsowanie)
zbiera `sendSignedSoap` z `@p1/transport`; moduły domenowe dokładają tylko to, co
specyficzne dla operacji (podpis CDA, budowa Body, ekstrakcja pól odpowiedzi).

Wzorzec **porty + adaptery**: czyste buildery i orkiestracja zależą od portów
(`DocumentSigner`, `HttpClient`, ...) wstrzykiwanych przez konsumenta. Szczegóły:
[docs/architektura.md](docs/architektura.md).

## Walidacja i testy

- `pnpm test` - testy jednostkowe (offline, w tym podpisywarka self-verify).
- `pnpm test:conformance` - każdy typ dokumentu przez **Schematron P1 + XSD** (wymaga assetów w `.local/`, inaczej się pomija).
- `pnpm test:e2e` - realny strzał w P1 integrację (opt-in: `P1_E2E=1`, certy w `.local/`).

## Dokumentacja

- [Architektura](docs/architektura.md) - warstwy, porty/adaptery, przepływ żądania, kontekst.
- [e-skierowania](docs/eskierowania.md) - typy dokumentów, budowa CDA, wystawianie, anulowanie.
- [e-recepta](docs/erecepta.md) - recepta na lek, odpłatności, uprawnienia dodatkowe, warianty, anulowanie.
- [Zdarzenia medyczne](docs/zdarzenia.md) - FHIR R4, OAuth2, zasoby i wysyłka.
- [EDM](docs/edm.md) - IHE XDS.b, token SAML, modele wdrożenia.
- [Podpisywarka](docs/podpisywarka.md) - podpis XAdES-BES in-process.

## Materiały poufne

Specyfikacje P1, dokumentacja, certyfikaty i dane testowe leżą lokalnie w `.local/`
(w `.gitignore`) i **nie są** częścią repo. Zob. `.local/README.md`.

<!-- TODO przed public: LICENSE, CONTRIBUTING, SECURITY, badge'e -->
