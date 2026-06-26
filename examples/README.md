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

Przykłady skierowań i recept **najpierw budują dokument CDA i wypisują jego podgląd**
(działa bez sieci), a następnie - jeśli dostępna jest konfiguracja P1 - wysyłają go na
środowisko integracyjne i pokazują wynik. Bez konfiguracji wysyłka jest pomijana.
Zdarzenie medyczne (`09`) działa wyłącznie online (REST/FHIR), więc bez certów jest pomijane.

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

| Plik                                                                           | Co pokazuje                                                                  |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [`01-skierowanie-ogolne.ts`](./01-skierowanie-ogolne.ts)                       | skierowanie do poradni/szpitala (rozpoznania + procedury)                    |
| [`02-skierowanie-uzdrowiskowe.ts`](./02-skierowanie-uzdrowiskowe.ts)           | skierowanie na leczenie uzdrowiskowe (wywiad, badanie, wyniki, TERYT)        |
| [`03-recepta.ts`](./03-recepta.ts)                                             | recepta na jeden lek - pełny, rozpisany przykład (referencja)                |
| [`04-recepta-uprawnienia-dodatkowe.ts`](./04-recepta-uprawnienia-dodatkowe.ts) | recepta z uprawnieniem dodatkowym pacjenta (sekcja .3.69)                    |
| [`05-recepta-nie-zamieniac.ts`](./05-recepta-nie-zamieniac.ts)                 | „NZ" + info dla wydającego + lek wieloskładnikowy                            |
| [`06-recepta-pro-auctore.ts`](./06-recepta-pro-auctore.ts)                     | recepta pro auctore / pro familiae (RRECE)\*                                 |
| [`07-pakiet-wielu-recept.ts`](./07-pakiet-wielu-recept.ts)                     | wiele recept w jednym pakiecie (`submitPrescriptionPackage`)                 |
| [`08-anulowanie-recepty.ts`](./08-anulowanie-recepty.ts)                       | wystawienie, a następnie anulowanie recepty                                  |
| [`09-zdarzenie-porada.ts`](./09-zdarzenie-porada.ts)                           | zdarzenie medyczne: porada (FHIR + OAuth2 + autentyczność)                   |
| [`10-pobieranie-recept.ts`](./10-pobieranie-recept.ts)                         | wyszukanie recept pacjenta po PESEL + odczyt treści CDA                      |
| [`11-edm-rejestracja-repozytorium.ts`](./11-edm-rejestracja-repozytorium.ts)   | EDM: rejestracja własnego repozytorium XDS.b (SZAR)                          |
| [`12-edm-publikacja-indeksu.ts`](./12-edm-publikacja-indeksu.ts)               | EDM: zdarzenie ZM → token SAML → zapis indeksu (ITI-42)                      |
| [`13-edm-serwer-repozytorium.ts`](./13-edm-serwer-repozytorium.ts)             | EDM: własne repozytorium na porcie `DocumentStore` (offline)                 |
| [`14-edm-wyszukanie-i-zgody.ts`](./14-edm-wyszukanie-i-zgody.ts)               | EDM: wyszukanie (ITI-18) + zgody (SOZ) + pobranie (ITI-43)                   |
| [`15-recepta365.ts`](./15-recepta365.ts)                                       | recepta roczna (czas trwania kuracji + okno realizacji + opak. zbiorcze)     |
| [`16-ipom.ts`](./16-ipom.ts)                                                   | IPOM - Indywidualny Plan Opieki Medycznej (POM): plan opieki, zapis          |
| [`17-ipom-anulowanie.ts`](./17-ipom-anulowanie.ts)                             | IPOM: wystawienie planu, a następnie jego anulowanie (RPLC)                  |
| [`18-ipom-harmonogram.ts`](./18-ipom-harmonogram.ts)                           | IPOM: plan + powiązany harmonogram realizacji (HIPOM, status SRZ)            |
| [`19-ipom-odczyt.ts`](./19-ipom-odczyt.ts)                                     | IPOM: odczyt planu po identyfikatorze + wyszukanie planów pacjenta           |
| [`20-patient-summary.ts`](./20-patient-summary.ts)                             | Patient Summary (Karta Pacjenta): token OAuth2 + pobranie podsumowania (CDA) |
| [`21-recepta-ulamek-opakowania.ts`](./21-recepta-ulamek-opakowania.ts)         | ułamkowa liczba opakowań (1 szt. z opak. po 10, np. 1 amp. Dexavenu)         |

Recepty `03`-`05`, `07`-`08`, `10`, `15`, zdarzenie `09`, EDM `12`, IPOM `16`-`19` oraz Patient Summary `20` potwierdzone e2e (Sukces; wyszukiwanie IPOM zwraca błąd marshallingu po stronie INT - odczyt po id działa). \* `06` pro auctore buduje poprawny dokument, ale pełny e2e wymaga osobnej puli
numerów recept (`...2.10.*`) przydzielonej do konta.

> **EDM (`11`-`14`)** to IHE XDS.b (SOAP/ebRIM, token SAML). Model „własne repozytorium":
> treść trzyma podmiot (port `DocumentStore`, przykład `13` działa offline), P1 prowadzi
> rejestr indeksów spiętych ze zdarzeniem ZM (`MedicalEventId`). `12` wymaga `@p1/medical-events`
> (zdarzenie ZM); `14` ITI-18 bywa wolne na INT (timeout rejestru dla pacjenta z dużą liczbą
> danych). Szczegóły: [docs/edm.md](../docs/edm.md).

> **Zdarzenia medyczne (`09`)** używają innego stacku niż reszta: REST/FHIR R4 + OAuth2
> (bez SOAP/CDA), host `isus.ezdrowie.gov.pl/{token,fhir}`. Wspierany jest tylko typ
> **porada**. `signature.who`/`agent.who` to podmiot, a dane lekarza w zdarzeniu muszą
> zgadzać się z CWPM po NPWZ (`P1_DOCTOR_GIVEN`/`P1_DOCTOR_FAMILY`). Szczegóły:
> [docs/zdarzenia.md](../docs/zdarzenia.md).

### Wymagają rozszerzenia biblioteki (osobny temat)

Część wariantów z przykładowych SOAP-ów P1 potrzebuje funkcji buildera, których jeszcze
nie ma: **dawkowanie zmienne** (sekwencje, alternatywy, wiele okresów dawkowania, krotność
dobowa), **recepta recepturowa**, **wyrób medyczny** oraz **import docelowy**. Obsłużone:
recepta roczna z dawkowaniem stałym (`15`, czas trwania kuracji) i leki narkotyczne (Rpw, `03`-bazowo).

## Powiązana dokumentacja

- [docs/eskierowania.md](../docs/eskierowania.md)
- [docs/erecepta.md](../docs/erecepta.md)
- [docs/zdarzenia.md](../docs/zdarzenia.md)
- [docs/edm.md](../docs/edm.md)
- [docs/podpisywarka.md](../docs/podpisywarka.md)
