# Podpisywarka (XAdES-BES in-process)

`@p1/signing` zawiera **podpisywarkę** — `createXadesDocumentSigner` — która podpisuje
dokument CDA podpisem XAdES-BES **wewnątrz procesu**, bez zewnętrznego serwisu (wcześniej
był to sidecar Java/DSS — usunięty). Implementuje port `DocumentSigner` z `@p1/core`.
Podpis jest akceptowany przez P1 (potwierdzone end-to-end na integracji).

## Użycie

```ts
import { createXadesDocumentSigner } from "@p1/signing";
import { readFileSync } from "node:fs";

const signer = createXadesDocumentSigner({
  certificate: {
    p12: readFileSync("Adam713 Leczniczy.p12"), // PKCS#12 lekarza (klucz + cert)
    password: process.env.CERT_PASSWORD!,
  },
});

const signedXml = await signer.signXades(cdaXml); // CDA z dołączonym <ds:Signature>
```

Najczęściej nie woła się tego ręcznie — przekazuje się `signer` jako `documentSigner`
w `ReferralTransport` i używa `issueXxxReferral` (zob. [docs/eskierowania.md](eskierowania.md)).

## Co produkuje

Podpis **enveloped XAdES-BES** dołączony jako ostatnie dziecko korzenia dokumentu:

- `SignatureMethod` = RSA-SHA256, kanonikalizacja = exclusive c14n,
- referencja dokumentu (`URI=""`, transformy `enveloped` + `exc-c14n`),
- referencja `SignedProperties` (Type SignedProperties),
- `QualifyingProperties` → `SignedSignatureProperties`: `SigningTime` + `SigningCertificate`,
- `KeyInfo` z certyfikatem (`X509Certificate`).

## Jak to działa (i dlaczego tak)

Hybryda dwóch bibliotek:

1. **`xadesjs`** buduje strukturę podpisu (referencje, QualifyingProperties, KeyInfo).
   Silnik kryptograficzny to wbudowany `webcrypto` z `node:crypto` (bez `@peculiar/webcrypto`
   — unika różnic interopu CJS między tsx a vitest). Klucz z `.p12` wyciąga `node-forge`.

2. **`xml-crypto`** (`ExclusiveCanonicalization`) **przelicza** kluczowe wartości — bo
   kanonikalizacja `xmldsigjs` (wewnątrz `xadesjs`) jest niestandardowa i P1 ją odrzuca,
   a exc-c14n z `xml-crypto` jest zgodny z `xmllint`/DSS (ten sam c14n co w WS-Security,
   który P1 akceptuje). Przeliczane są:
   - `DigestValue` referencji dokumentu (z prologiem — patrz niżej),
   - `DigestValue` referencji `SignedProperties`,
   - `SignatureValue` (RSA-SHA256 nad exc-c14n `SignedInfo`, `node:crypto`).

## Niuanse wymagane przez weryfikator P1/DSS

Każdy ustalony na podstawie konkretnego błędu zwróconego przez P1:

- **PI `xml-stylesheet` musi zostać** w dokumencie (warstwa prezentacyjna; usunięcie →
  `REG.WER.070`). Digest referencji dokumentu liczony jest **z prologiem** (PI przed
  korzeniem + `"\n"`), z pominięciem deklaracji XML (xmldom pokazuje ją jako PI o target `xml`).
- **Referencja `SignedProperties` musi mieć transformę `exc-c14n`** — `xadesjs` jej nie
  dodaje, więc DSS użyłby inclusive c14n i digest by się nie zgadzał. Podpisywarka ją dokłada.
- P1 akceptuje zwykłe `enveloped` + `exc-c14n` (XPath Filter 2.0 niepotrzebny);
  SHA-1 i SHA-256 są akceptowane (używamy SHA-256).

## Certyfikat i produkcja

Podpisywarka podpisuje **miękkim `.p12`** (klucz + cert w pliku). Na integracji to certyfikat
pracownika (np. „Adam713 Leczniczy"). To samo ograniczenie miał serwis Java/DSS — więc jego
usunięcie nic nie odbiera.

Gdyby produkcja wymagała podpisu kwalifikowanego na karcie/HSM, wystarczy **nowy adapter portu
`DocumentSigner`** (np. PKCS#11) — bez zmian w builderach CDA i transporcie.

## Test

Test jednostkowy (offline, w CI) generuje jednorazowy `.p12` (node-forge), podpisuje minimalny
dokument i **kryptograficznie weryfikuje** `SignatureValue` (względem exc-c14n `SignedInfo`)
oraz digest referencji dokumentu — bez sięgania po realne certy:
`packages/signing/src/xades-document-signer.test.ts`.
