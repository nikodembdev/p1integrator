# Przykłady (`examples/`)

Gotowe, uruchamialne przykłady użycia biblioteki - pokazują, jak wywołać funkcje
`@p1/*` bez zaglądania do kodu samej libki. Każdy przykład to jeden plik z danymi
dokumentu wpisanymi inline (z komentarzami) i pojedynczym wywołaniem funkcji.

## Jak uruchomić

```bash
pnpm install
pnpm -r build                       # przykłady importują zbudowane paczki @p1/*
pnpm tsx examples/01-skierowanie-ogolne.ts
```

Każdy przykład **najpierw buduje dokument CDA i wypisuje jego podgląd** (działa bez
sieci), a następnie - jeśli dostępna jest konfiguracja P1 - wysyła go na środowisko
integracyjne i pokazuje wynik. Bez konfiguracji wysyłka jest pomijana.

## Konfiguracja (do realnej wysyłki)

Wspólna „hydraulika" (dane konta, kontekst, certyfikaty, transport) jest w
[`config.ts`](./config.ts). Wartości czytane są z `.local/p1.env` (gitignored) -
wzór kluczy w [`.env.example`](../.env.example). Potrzebne:

- dane konta integracyjnego: `P1_LOCAL_ROOT`, `P1_PODMIOT_EXT`, `P1_NPWZ`,
  `P1_REGON14`/`P1_REGON9`, `P1_NFZ_BRANCH`/`P1_NFZ_CONTRACT`, `P1_ORG_UNIT_EXT`,
  `P1_MUS_EXT`, oraz pacjent `P1_PATIENT_*`,
- certyfikaty PKCS#12 w `.local/certs/` (TLS, WS-Security, podpis lekarza) + `CERT_PASSWORD`.

> Bez kompletu env/certów przykłady i tak zbudują poprawny dokument i go wypiszą -
> tylko nie wyślą go do P1.

## Lista przykładów

| Plik                                                                           | Co pokazuje                                                           |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [`01-skierowanie-ogolne.ts`](./01-skierowanie-ogolne.ts)                       | skierowanie do poradni/szpitala (rozpoznania + procedury)             |
| [`02-skierowanie-uzdrowiskowe.ts`](./02-skierowanie-uzdrowiskowe.ts)           | skierowanie na leczenie uzdrowiskowe (wywiad, badanie, wyniki, TERYT) |
| [`03-recepta.ts`](./03-recepta.ts)                                             | recepta na jeden lek - pełny, rozpisany przykład (referencja)         |
| [`04-recepta-uprawnienia-dodatkowe.ts`](./04-recepta-uprawnienia-dodatkowe.ts) | recepta z uprawnieniem dodatkowym pacjenta (sekcja .3.69)             |
| [`05-recepta-nie-zamieniac.ts`](./05-recepta-nie-zamieniac.ts)                 | „NZ" + info dla wydającego + lek wieloskładnikowy                     |
| [`06-recepta-pro-auctore.ts`](./06-recepta-pro-auctore.ts)                     | recepta pro auctore / pro familiae (RRECE)\*                          |
| [`07-pakiet-wielu-recept.ts`](./07-pakiet-wielu-recept.ts)                     | wiele recept w jednym pakiecie (`submitPrescriptionPackage`)          |
| [`08-anulowanie-recepty.ts`](./08-anulowanie-recepty.ts)                       | wystawienie, a następnie anulowanie recepty                           |

Recepty `03`-`05`, `07`-`08` potwierdzone e2e (Sukces). \* `06` pro auctore buduje
poprawny dokument, ale pełny e2e wymaga osobnej puli numerów recept (`...2.10.*`)
przydzielonej do konta.

### Wymagają rozszerzenia biblioteki (osobny temat)

Część wariantów z przykładowych SOAP-ów P1 potrzebuje funkcji buildera, których jeszcze
nie ma: **dawkowanie zmienne / czas trwania kuracji** (recepty 365-dniowe, sekwencje,
alternatywy, krotność dobowa), **recepta recepturowa**, **wyrób medyczny**,
**import docelowy** oraz **leki narkotyczne (Rpw)**.

## Powiązana dokumentacja

- [docs/eskierowania.md](../docs/eskierowania.md)
- [docs/erecepta.md](../docs/erecepta.md)
- [docs/podpisywarka.md](../docs/podpisywarka.md)
