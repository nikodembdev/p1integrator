# Architektura

`p1integrator` to bezstanowy, warstwowy SDK, który zamienia surowe API P1
(SOAP / CDA / XAdES / WS-Security / mTLS) na typowane API dziedzinowe. Nie ma w nim
bazy danych, kolejek ani workflow - to zostaje po stronie konsumenta.

## Dwie warstwy

1. **Czyste building-blocki (bez I/O)** - funkcje, które tylko liczą:
   - `buildXxxReferralCda(input) → { xml }` - budowa dokumentu CDA,
   - `buildSoapEnvelope(...)`, `signWsSecurity(...)`, `parseSoapResponse(...)` - koperta i odpowiedź.
     Łatwe do testów (golden/Schematron/XSD), deterministyczne.

2. **Orkiestracja (z I/O za portami)** - `issueXxxReferral(input, transport)` składa całość:
   `build → sign → envelope → send → parse → map`. I/O nie jest twarde - siedzi za **portami**.

## Porty i adaptery

Porty (interfejsy) są w `@p1/core`; konsument wstrzykuje konkretne adaptery.

| Port (`@p1/core`)               | Co robi                           | Adapter w repo                                         |
| ------------------------------- | --------------------------------- | ------------------------------------------------------ |
| `DocumentSigner.signXades(xml)` | podpis XAdES dokumentu            | `@p1/signing` `createXadesDocumentSigner` (in-process) |
| `HttpClient.send(req)`          | HTTP z mTLS                       | `@p1/transport` `createNodeHttpClient`                 |
| `Clock.now()`                   | czas (deterministyczny w testach) | wstrzykiwany                                           |

Dzięki portom wymiana implementacji to jedna linia (np. przyszły adapter karta/HSM dla
podpisu kwalifikowanego w produkcji - bez zmian w builderach/transport).

## Pakiety

```
core/        typy domenowe, Result<T,E> + P1Error, porty, CallContext, OID-y kontekstu
cda/         generyczny buildClinicalDocument (CDA PL IG 1.3.2) + stałe OID/szablony
signing/     podpisywarka XAdES-BES in-process
transport/   buildSoapEnvelope, signWsSecurity, parseSoapResponse, createNodeHttpClient, parseP12
referral/    typy skierowań (per katalog) + wspólne sekcje + submitReferralDocument
prescription/ e-recepta: buildDrugPrescriptionCda + pakiet recept + anulowanie
```

Kolejność budowy/zależności: `core → cda → signing/transport → referral, prescription`.
Dialekt transportu e-recepty (namespace v20170510, prefiks kontekstu `erecepta:`) jest
parametrem `buildSoapEnvelope`/`signWsSecurity`/`contextToAttributes` - domyślnie e-skierowanie.

## Przepływ żądania (wystawienie skierowania)

```
input (dane dziedzinowe)
  │  buildXxxReferralCda            → CDA (XML, CDA PL IG 1.3.2)
  │  documentSigner.signXades       → CDA podpisany XAdES-BES (enveloped)
  │  base64 → <mt:tresc>            → body operacji SOAP
  │  buildSoapEnvelope (+ kontekst) → koperta SOAP z nagłówkiem kontekstu
  │  signWsSecurity                 → podpis koperty (WS-Security, cert WSS)
  │  httpClient.send (mTLS)         → POST na endpoint P1
  │  parseSoapResponse              → WynikMT / BladMT
  ▼
Result<{ referralCode, referralKey, outcome }, P1Error>
```

## Kontekst wywołania (`CallContext`)

P1 wymaga w nagłówku SOAP „kontekstu wywołania" - kto i w jakiej roli woła usługę:

```ts
const context: CallContext = {
  subject: { root, extension }, // idPodmiotu - identyfikator BIZNESOWY podmiotu
  user: { root, extension }, // idUzytkownika - NPWZ pracownika
  workplace: { root, extension }, // idMiejscaPracy - komórka org. (MUŚ)
  businessRole: "DOCTOR", // BUSINESS_ROLE → np. LEKARZ_LEK_DENTYSTA_FELCZER
};
```

`@p1/core` mapuje to na atrybuty `kontekstWywolania`. Dobór poprawnych OID-ów jest
specyficzny dla konta integracyjnego (nie należy do repo) - trzymany lokalnie.

## Obsługa błędów

Operacje zwracają `Result<T, P1Error>` (bez wyjątków na ścieżce biznesowej):

- `result.ok === false` → `result.error` (kind: `transport` | `server` | ...),
- `result.ok === true` → `result.value`, w tym `outcome` (WynikMT: `major`/`minor`/`message`).

P1 waliduje etapami - każdy daje inny `major/minor` lub kod `REG.WER.*`: WS-Security/mTLS →
kontekst → XSD CDA → reguły biznesowe. Sukces: `major = urn:csioz:p1:kod:major:Sukces`.

## Granica językowa kodu

API i nazwy w kodzie po angielsku; wartości „na drucie" P1 (kody, role, OID-y) i komentarze
po polsku - zob. notatka o granicy językowej w repo.
