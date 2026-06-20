# p1integrator

TypeScript SDK ucywilizowujący API polskiej platformy P1 (e-zdrowie).
Zamienia surowe SOAP / CDA / XAdES / WS-Security na czyste, typowane,
dziedzinowe API.

> ⚠️ Wczesny etap rozwoju (0.x) - publiczne API jeszcze niestabilne.

## Moduły (etap 1)

- `@p1/prescription` - e-recepta
- `@p1/referral` - e-skierowanie (w tym skierowanie do uzdrowiska)

## Architektura (monorepo)

```
packages/
├── core/          # typy domenowe, Result/błędy, porty, rejestr środowisk
├── cda/           # typowany builder CDA PL IG 1.3.2 + walidacja Schematron
├── signing/       # port Signer + adapter Java/DSS (XAdES)
├── transport/     # port HttpClient (mTLS) + koperty SOAP + WS-Security
├── prescription/  # moduł e-recepty
└── referral/      # moduł e-skierowania
```

Materiały poufne (specyfikacje P1, dokumentacja, certyfikaty, próbki) leżą
lokalnie w `.local/` i **nie są** częścią repo. Zob. `.local/README.md`.

<!-- TODO przed public: LICENSE, CONTRIBUTING, SECURITY, instrukcja użycia, badge'e -->
