# Zdarzenia medyczne (ZM)

Moduł `@p1/medical-events` rejestruje zdarzenia medyczne w P1 przez REST/FHIR R4
(inny stack niż e-recepta/e-skierowanie: brak SOAP, CDA i WS-Security). Uwierzytelnienie
to OAuth2 (client credentials + podpisany JWT, RFC 7523), a zasoby FHIR wysyła się
osobno pod `/fhir/{Resource}`. Ścieżka end-to-end potwierdzona na środowisku
integracyjnym (zdarzenie utworzone wraz z autentycznością, HTTP 201).

> **Zakres: tylko porada.** Moduł pokrywa jeden typ zdarzenia - **poradę**
> (typ zdarzenia `4`, słownik OID `.11.1.34`). Pozostałe typy (hospitalizacja,
> wyjazd ratunkowy, bilans itd.) oraz zasoby pomocnicze (Observation, Coverage,
> Claim, Immunization) nie są jeszcze zaimplementowane. Builder Encounter przyjmuje
> dowolny kod typu, ale przetestowana i wspierana jest wyłącznie porada.

## Składniki zdarzenia (porada)

Kompletne zdarzenie to cztery zasoby FHIR utworzone po kolei:

1. **Patient** - pacjent. Z numerem PESEL zwykle już istnieje w P1, więc go
   wyszukujemy (`GET /fhir/Patient?plpatient=...&plgiven=...&plfamily=...`),
   a tworzymy tylko nowego/bez PESEL (`buildMedicalEventPatient`).
2. **Encounter** - samo zdarzenie porady (`buildMedicalEventEncounter`,
   profil PLMedicalEvent).
3. **Condition** - rozpoznanie ICD-10, wymagane w zdarzeniu
   (`buildMedicalEventCondition`, profil PLMedicalEventDiagnosis).
4. **Provenance** - autentyczność: zasób z podpisem XAdES-BES nad utworzonymi
   zasobami (`buildMedicalEventProvenance` + `buildProvenanceSignature`,
   profil PLMedicalEventProvenance).

## Przepływ użycia

```ts
import {
  requestAccessToken,
  createFhirClient,
  buildMedicalEventEncounter,
  buildMedicalEventCondition,
  buildProvenanceSignature,
  buildMedicalEventProvenance,
} from "@p1/medical-events";
import { createNodeHttpClient, parseP12 } from "@p1/transport";

const wss = parseP12(wssP12, password);
const tls = parseP12(tlsP12, password);
const httpClient = createNodeHttpClient({
  tls: { key: tls.privateKeyPem, cert: tls.certificatePem },
});

// 1) Token OAuth2 (JWT podpisany kluczem WSS)
const token = await requestAccessToken(
  {
    tokenEndpoint: "https://isus.ezdrowie.gov.pl/token",
    privateKeyPem: wss.privateKeyPem,
    issuer: `2.16.840.1.113883.3.4424.2.3.1:${podmiot}`,
    subject: `2.16.840.1.113883.3.4424.2.3.1:${podmiot}`,
    userId: `2.16.840.1.113883.3.4424.1.6.2:${npwz}`,
    userRole: "LEK",
    childOrganization: `2.16.840.1.113883.3.4424.2.3.3:${podmiot}-${komorka}`,
  },
  httpClient,
);
if (!token.ok) throw token.error;

const fhir = createFhirClient({
  baseUrl: "https://isus.ezdrowie.gov.pl/fhir",
  accessToken: token.value.accessToken,
  httpClient,
});

// 2) Encounter + Condition (POST /fhir/{Resource})
// 3) readXml każdego utworzonego zasobu, podpis nad wersjonowanymi URL-ami
// 4) POST /fhir/Provenance
```

Pełny, działający przykład end-to-end: `scripts/smoke-zm-zdarzenie.ts`.

## Autentyczność (podpis)

`Provenance.signature.data` to detached **XAdES-BES** (base64):

- kanonikalizacja **inclusive** (`http://www.w3.org/TR/2001/REC-xml-c14n-20010315`),
  podpis RSA-SHA256;
- jedna `ds:Reference` na zasób, kierująca na jego **publiczny, wersjonowany URL**
  (`{fhirBase}/{Type}/{id}/_history/{ver}`), z digestem sha256 nad surowymi oktetami
  XML pobranymi przez `readXml` (bez Transforms);
- `SignedProperties` z `SigningTime` i `SigningCertificate`, podpis certyfikatem
  WSS podmiotu (wystarcza sam certyfikat podpisujący, bez łańcucha CA).

W zasobie Provenance zarówno `agent.who`, jak i `signature.who` to identyfikator
**podmiotu leczniczego** (OID `.2.3.1`); profil nie dopuszcza `role`/`display`/`onBehalfOf`.

## Uwierzytelnienie OAuth2 - szczegóły

P1 zwraca odpowiedź niestandardowo: JSON `{ error, accessToken }` z polami
**camelCase** (`accessToken`, nie `access_token`). `aud` w JWT to stała
`https://ezdrowie.gov.pl/token` (nie host `isus`), a `scope` przy POST `/token`
to `https://ezdrowie.gov.pl/fhir`. Błąd walidacji tokenu zwraca HTTP 422 ze
wskazaniem brakującego/złego pola (`error.location`).
