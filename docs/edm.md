# EDM (Elektroniczna Dokumentacja Medyczna)

Moduł `@p1/edm` integruje z P1 w obszarze EDM, czyli **IHE XDS.b** (SOAP, ebRIM/ebRS).
To inny stack niż recepta/skierowanie (CDA-przez-SOAP) i niż zdarzenia (`@p1/medical-events`,
FHIR/OAuth2). EDM rozdziela **indeks** (metadane o dokumencie, centralny rejestr u P1) od
**treści** (sam dokument, w repozytorium świadczeniodawcy).

## Architektura: repozytorium robi konsument, my dajemy maszynerię

P1 **nie hostuje produkcyjnego repozytorium** - na PROD każdy podmiot ma własne repozytorium
XDS.b, a P1 prowadzi centralny rejestr indeksów i pobiera dokumenty z repozytoriów podmiotów
(`irmdsus` to repo testowe tylko na INT). Dlatego biblioteka:

- **nie jest** serwerem repozytorium (to hosting/infra konsumenta),
- daje **port `DocumentStore`** (przechowywanie treści robi konsument: dysk/S3/baza),
- daje **handlery protokołu** (ITI-43 retrieve, ITI-41 provide&register) do wpięcia we własny serwer HTTP,
- daje **klienta rejestru** (token SAML, ITI-42/18/57, ITI-43 klient, rejestracja repo, audyt ITI-20).

```
@p1/edm
├─ DocumentStore (port)      put(content,mime)->{uniqueId,hash,size}; get(repoId,docId)
├─ token SAML               generujToken (WS-Trust RST/Issue) -> asercja do WS-Security
├─ klient rejestru          ITI-42 zapis indeksu, ITI-18 wyszukanie, ITI-57 aktualizacja
├─ klient repozytorium      ITI-43 pobranie, ITI-41 zapis treści
├─ toolkit serwera repo     handleRetrieveDocumentSet (ITI-43), handleProvideAndRegister (ITI-41)
├─ rejestracja repo (SZAR)  rejestrujRepozytorium / rejestrujDaneDostepowe
├─ audyt ATNA (ITI-20)      budowa + wysyłka syslog/TLS (port 6514)
└─ zgody (SOZ)              weryfikujDostepDoDanych
```

## Jak to działa

Publikacja dokumentu (Wasz system -> P1):

1. tworzysz dokument (np. CDA), zapisujesz w swoim repo (`DocumentStore.put` -> uniqueId + SHA-1 + rozmiar),
2. ITI-42: rejestrujesz indeks w P1 (SubmissionSet + DocumentEntry + Association), DocumentEntry
   wskazuje Twoje repo (`repositoryUniqueId`, `URI`) i niesie `MedicalEventId` (powiązanie ze
   zdarzeniem medycznym, [@p1/medical-events](./zdarzenia.md)).

Odczyt (konsument/P1 -> Wasze repo):

1. ITI-18: zapytanie do rejestru P1 (po pacjencie/statusie) -> lista DocumentEntry,
2. ITI-43: pobranie treści z repozytorium wskazanego w indeksie (`repositoryUniqueId` + `documentUniqueId`),
3. ITI-20: repozytorium wysyła log audytowy (ATNA) do P1.

## Wymogi (z dokumentacji integracyjnej W29)

- **mTLS** (cert TLS systemu) + **podpis WS-Security X.509** (cert WSS podmiotu) na wszystkich operacjach.
- **Token SAML** w nagłówku WS-Security dla operacji EDM (z usługi `generujToken`). Token niesie:
  identyfikator pracownika, podmiotu, placówki (opc.), pacjenta (opc.), rolę, **tryb dostępu**
  (NORMAL / BTG ratowanie życia / CONTT kontynuacja leczenia). Dane przekazywane przez
  `kontekstWywolania` (v20180509, jak w skierowaniu).
- Trzy profile podpisu (ten sam cert może podpisywać wszystkie): sec1 (ITI-18, SOZ),
  sec2 (ITI-42/57/41/43), sec3 (AUT, SZAR).
- Rejestracja repozytorium: parametr `urn:CEZ:p1:daneDostepowe:adresUslugi` = adres sieciowy repo
  (aktualizacja = pełna podmiana zestawu parametrów).

## Endpointy (INT)

Rejestr (host `isus.ezdrowie.gov.pl`): ITI-42 `/services/ObslugaEdmIti42WS`, ITI-18
`/services/ObslugaEdmIti18WS`, ITI-57 `/services/ObslugaEdmIti57WS`, ITI-20 `:6514` (TLS mutual).
Repozytorium (host `irmdsus.ezdrowie.gov.pl`, INT-only): ITI-41 `/services/ObslugaRedDzIti41WS`,
ITI-43 `/services/ObslugaRedDzIti43WS`. Wspierające (isus): token
`/services/ObslugaGenerowanieTokenuSamlWS`, SZAR `/services/ObslugaRejestrowanieDanychDostepowychWS`,
SOZ `/services/ObslugaWeryfikacjiDostepuDoDanychWS`.

## Plan budowy (fazy)

0. **Fundament** (zrobione): port `DocumentStore`, helpery metadanych (SHA-1, rozmiar), typy.
1. **Token SAML** (`generujToken`): WS-Trust RST/Issue + kontekst + WSS X.509 -> asercja.
2. **ITI-42** zapis indeksu: builder ebRIM (SubmissionSet + DocumentEntry + Association) + `MedicalEventId`.
3. **ITI-18** wyszukanie: StoredQuery (GetAll, FindDocuments, FindFolders, GetFolderAndContents,
   GetRelatedDocuments), returnType ObjectRef/LeafClass, tryby BTG/CONTT.
4. **ITI-43** pobranie (klient) + **toolkit serwera repo** (handler ITI-43 na `DocumentStore`).
5. **ITI-41** zapis treści (klient + handler), **ITI-57** aktualizacja, **SZAR** rejestracja repo,
   **ITI-20** audyt ATNA, **SOZ** weryfikacja zgód.
