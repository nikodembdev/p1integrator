# p1integrator

TypeScript SDK ucywilizowujący API polskiej platformy P1 (e-zdrowie).
Zamienia surowe SOAP / CDA / XAdES / WS-Security na czyste, typowane,
dziedzinowe API.

> ⚠️ Wczesny etap rozwoju (0.x) — publiczne API jeszcze niestabilne.

## Status

- ✅ **e-skierowanie** — 7 typów dokumentów + anulowanie, każdy zwalidowany Schematronem P1 i XSD; **potwierdzone end-to-end na środowisku integracyjnym** (P1 zwraca `Sukces` + `kodSkierowania`). Zob. [docs/eskierowania.md](docs/eskierowania.md).
- ✅ **podpisywarka XAdES in-process** — podpis dokumentu bez zewnętrznego serwisu. Zob. [docs/podpisywarka.md](docs/podpisywarka.md).
- ⏳ **e-recepta** — planowane.

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
├── core/          # typy domenowe, Result/błędy, porty (DocumentSigner, HttpClient…), kontekst
├── cda/           # typowany builder CDA PL IG 1.3.2 (generyczny buildClinicalDocument)
├── signing/       # podpisywarka XAdES-BES in-process (adapter portu DocumentSigner)
├── transport/     # HttpClient mTLS + koperty SOAP + WS-Security + parser odpowiedzi
├── referral/      # e-skierowanie: typy dokumentów + orkiestracja wysyłki
└── prescription/  # e-recepta (planowane)
```

Wzorzec **porty + adaptery**: czyste buildery i orkiestracja zależą od portów
(`DocumentSigner`, `HttpClient`, …) wstrzykiwanych przez konsumenta. Szczegóły:
[docs/architektura.md](docs/architektura.md).

## Walidacja i testy

- `pnpm test` — testy jednostkowe (offline, w tym podpisywarka self-verify).
- `pnpm test:conformance` — każdy typ dokumentu przez **Schematron P1 + XSD** (wymaga assetów w `.local/`, inaczej się pomija).
- `pnpm test:e2e` — realny strzał w P1 integrację (opt-in: `P1_E2E=1`, certy w `.local/`).

## Dokumentacja

- [Architektura](docs/architektura.md) — warstwy, porty/adaptery, przepływ żądania, kontekst.
- [e-skierowania](docs/eskierowania.md) — typy dokumentów, budowa CDA, wystawianie, anulowanie.
- [Podpisywarka](docs/podpisywarka.md) — podpis XAdES-BES in-process.

## Materiały poufne

Specyfikacje P1, dokumentacja, certyfikaty i dane testowe leżą lokalnie w `.local/`
(w `.gitignore`) i **nie są** częścią repo. Zob. `.local/README.md`.

<!-- TODO przed public: LICENSE, CONTRIBUTING, SECURITY, badge'e -->
