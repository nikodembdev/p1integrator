# Moje Zdrowie (SGO-A)

Moduł `@p1/moje-zdrowie` integruje usługę **Moje Zdrowie** (system SGO-A) -
program badań profilaktycznych, następcę „Profilaktyki 40+". Pacjent wypełnia
ankietę (w IKP/mIKP albo w placówce), P1 generuje na jej podstawie **zakres
badań**, a placówka POZ steruje jego realizacją. Stack: REST/FHIR R4 + OAuth2,
serwer `https://{szyna}/sgoa/fhir` (integracja: `isus.ezdrowie.gov.pl`).
Ścieżka odczytu (token, `$eligible`, wyszukiwanie ankiet) potwierdzona e2e
na środowisku integracyjnym.

Dokumentacja źródłowa: FHIR IG „Dokumentacja Integracyjna SGO-A" (v28.3.2),
dostępna na integracji pod `/moje_zdrowie/` (mTLS; lokalny dump w
`.local/moje-zdrowie/`).

## Uwierzytelnienie

Token pobiera się tym samym mechanizmem co w zdarzeniach medycznych -
`requestAccessToken` z `@p1/medical-events` (OAuth2 `client_credentials` +
`private_key_jwt`, RS256 kluczem z certyfikatu P1 do uwierzytelniania danych).
Różnice ujmuje helper `buildSgoaTokenRequest`:

- `scope = https://ezdrowie.gov.pl/fhir-sgoa` (`SGOA_FHIR_SCOPE`),
- role użytkownika: `LEK`, `FEL`, `LEKD`, `PIEL`, `POL`, `ASYS`, `PROF`,
  `PROFILAKTYK`; przy `ASYS` obowiązkowy kontekst pracownika (`assistantContext`,
  claim `con`),
- **bez `purpose`** (SGO-A nie zna trybów BTG/CONTT).

> **Kontekst siedzi w tokenie.** W odróżnieniu od Patient Summary / ZM żądania
> FHIR nie niosą nagłówków `Kontekst-*` ani `Identyfikator-Pacjenta` - pacjenta
> wskazuje się PESEL-em w zasobie lub parametrze wyszukiwania.

## Mapowanie operacji

Klienta tworzy `createSgoaClient({ baseUrl, accessToken, httpClient, language? })`
(`language` ustawia `Accept-Language: en|uk` - i18n treści ankiet).

| P1 (SGO-A)                                        | Funkcja modułu                                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /Questionnaire/$eligible?pesel&program-code` | `findEligibleQuestionnaires`                                                                                     |
| `GET /Questionnaire?age&gender&program-code`      | `searchQuestionnaires` (+`nextQuestionnairesPage`)                                                               |
| `GET /Questionnaire/{id}`                         | `getQuestionnaire` (parser pełnej definicji)                                                                     |
| `POST /QuestionnaireResponse`                     | `submitSurveyResponse` (builder: `buildSurveyResponse`)                                                          |
| `PUT /QuestionnaireResponse/{id}` (edycja)        | `updateSurveyResponse` (guard `surveyLock`)                                                                      |
| `GET /QuestionnaireResponse/{id}` / wyszukiwanie  | `getSurveyResponse` / `searchSurveyResponses`                                                                    |
| anulowanie / wycofanie anulowania (PUT statusu)   | `cancelSurveyResponse` / `restoreSurveyResponse`                                                                 |
| `GET .../{id}/$printout` / `$summary`             | `getSurveyPrintout` / `getSurveySummaryPdf` (PDF `Buffer`)                                                       |
| `GET .../{id}/$structured-summary`                | `getSurveyStructuredSummary`                                                                                     |
| `GET /CarePlan/{id}` / wyszukiwanie               | `getExamPlan` / `searchExamPlans`                                                                                |
| przejścia statusów CarePlan (PUT pełnego zasobu)  | `acceptExamPlan`, `holdExamPlan`, `completeExamPlan`, `reopenExamPlan`, `backToHoldExamPlan`, `withdrawExamPlan` |
| `GET /ValueSet/{id}/$expand`                      | `expandValueSet`                                                                                                 |

Zakresu badań **nie tworzy się po stronie klienta** - generuje go P1 przy zapisie
ankiety; jego id wraca w `basedOn` (u nas: `SurveyResponse.examPlanId`).
Definicje ankiet są tylko do odczytu (na integracji: `Moje-Zdrowie.1-4`,
warianty płeć × wiek 20-59 / 60-120).

## Maszyna stanów zakresu badań

```
draft ──accept──▶ active ──hold──▶ on-hold ──complete──▶ completed
  ▲                 │  ▲              │   ▲                  │
  └───withdraw──────┴──┼──────────────┘   └───backToHold─────┘
                       └─────────────reopen──────────────────┘
```

- `acceptExamPlan` (draft→active) wymaga daty podjęcia i **blokuje edycję
  ankiety** (`surveyLock`); wykonać może ją tylko placówka POZ pacjenta
  (REG.16996).
- `withdrawExamPlan` (→draft) usuwa `period.start` (wymóg P1) i odblokowuje
  edycję ankiety.
- pozostałe przejścia (REG.16991) może wykonać tylko placówka, która realizację
  rozpoczęła. `entered-in-error` ustawia wyłącznie system (anulowanie ankiety).

Moduł waliduje dozwolone przejście lokalnie (bez wywołania serwera przy błędnym
stanie), a przejścia wykonuje odczytując zasób i wysyłając PUT pełnej treści.

## Reguły biznesowe (najczęstsze)

Kody REG.\* z `OperationOutcome` mapują się na `P1BusinessError` z podpowiedzią
(słownik `SGOA_RULE`). Kluczowe:

- **REG.16975** - ankieta w programie `moje_zdrowie` tylko RAZ na pacjenta,
- **REG.16928** - dane pacjenta muszą zgadzać się z CWUb,
- **REG.17247** - 12 miesięcy karencji po udziale w „Profilaktyce 40 PLUS",
- **REG.16969** - pola wyliczane (np. BMI) muszą zgadzać się z wyrażeniem
  z definicji (`fhirPathCalculatedExpression`),
- **REG.16978/17638** - edycja/anulowanie zablokowane po podjęciu realizacji.

## Przykłady i testy

- `examples/22-moje-zdrowie-ankieta.ts` - ankieta: `$eligible`, zapis
  (za flagą `P1_SGOA_SUBMIT=1`), wydruk PDF, podsumowanie strukturalne.
- `examples/23-moje-zdrowie-zakres-badan.ts` - zakres badań: odczyt zaleconych
  badań i realizacja (za flagą `P1_SGOA_REALIZACJA=1`).
- e2e: `P1_E2E=1 pnpm test:e2e` (odczyt); ścieżka zapisu dodatkowo za
  `P1_SGOA_E2E_WRITE=1` - wymaga pacjenta z deklaracją POZ w podmiocie
  testowym (inaczej REG.16996/17429).
