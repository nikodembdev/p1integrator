// Moje Zdrowie (SGO-A): ankieta profilaktyczna pacjenta - definicje dostępne dla
// pacjenta ($eligible), zapis wypełnionej ankiety i wydruk PDF.
// Token OAuth2 (private_key_jwt, scope fhir-sgoa) + serwer FHIR /sgoa/fhir.
// pnpm tsx examples/22-moje-zdrowie-ankieta.ts
//
// UWAGA: ankietę `moje_zdrowie` pacjent może wypełnić tylko RAZ (REG.16975) -
// zapis wykonuje się dopiero z P1_SGOA_SUBMIT=1; bez flagi przykład tylko czyta.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { requestAccessToken } from "@p1/medical-events";
import {
  buildSgoaTokenRequest,
  buildSurveyResponse,
  createSgoaClient,
  fillSurveyDefinition,
  findEligibleQuestionnaires,
  getSurveyPrintout,
  getSurveyStructuredSummary,
  searchSurveyResponses,
  submitSurveyResponse,
  type SurveyDefinition,
  type SurveyResponseItemInput,
} from "@p1/moje-zdrowie";
import { account, endpoints, patient, zmTransport } from "./config.js";

const e = process.env;
// Pacjent testowy SGO-A (z projektu testów CEZ) - przy zapisie imię/nazwisko
// muszą zgadzać się z CWUb, więc są konfigurowalne razem z PESEL-em.
const pesel = e.P1_SGOA_PATIENT ?? patient.pesel;
const givenNames = e.P1_SGOA_PATIENT_GIVEN ? [e.P1_SGOA_PATIENT_GIVEN] : patient.givenNames;
const familyName = e.P1_SGOA_PATIENT_FAMILY ?? patient.familyName;

/**
 * Odpowiedzi demo: automat `fillSurveyDefinition` (enableWhen, granice liczb)
 * + jawne wartości antropometryczne - BMI to pole wyliczane, serwer weryfikuje
 * zgodność z wyrażeniem z definicji (REG.16969).
 */
function fillDemoAnswers(definition: SurveyDefinition): SurveyResponseItemInput[] {
  const WZROST = 175;
  const MASA = 80.5;
  const BMI = Math.round((MASA / (WZROST / 100) ** 2) * 10) / 10;
  return fillSurveyDefinition(definition, {
    overrides: {
      wzrost: [WZROST],
      "masa-ciala": [{ decimal: MASA }],
      bmi: [{ decimal: BMI }],
    },
  });
}

const zm = zmTransport();
if (!zm) {
  // Bez certów: pokazujemy zbudowany zasób QuestionnaireResponse (offline).
  const preview = buildSurveyResponse({
    privacyPolicyAcceptanceDate: new Date().toISOString(),
    questionnaireUrl: "https://ezdrowie.gov.pl/fhir/Questionnaire/Moje-Zdrowie.2",
    patient: { pesel, givenNames, familyName },
    items: [
      {
        linkId: "dane-podstawowe",
        text: "Dane podstawowe",
        items: [
          { linkId: "wzrost", text: "Wzrost (cm)", answers: [175] },
          { linkId: "masa-ciala", text: "Masa ciała (kg)", answers: [80] },
        ],
      },
    ],
  });
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - podgląd zasobu offline:\n");
  console.log(JSON.stringify(preview, null, 2));
  process.exit(0);
}

// 1. Token OAuth2 dla SGO-A (scope fhir-sgoa; kontekst siedzi w tokenie).
const tokenRequest = buildSgoaTokenRequest({
  tokenEndpoint: endpoints.sgoaToken,
  privateKeyPem: zm.privateKeyPem,
  subject: `${account.providerRoot}:${account.podmiotExt}`,
  userId: `${account.npwzRoot}:${account.npwz}`,
  userRole: "LEK",
  childOrganization: `${account.musRoot}:${account.podmiotExt}-${account.musExt}`,
});
if (!tokenRequest.ok) {
  console.error("Błąd konfiguracji tokenu:", tokenRequest.error.message);
  process.exit(1);
}
const token = await requestAccessToken(tokenRequest.value, zm.httpClient);
if (!token.ok) {
  console.error("Nie udało się uzyskać tokenu SGO-A:", token.error.message);
  process.exit(1);
}
console.log("Token SGO-A uzyskany.");

const client = createSgoaClient({
  baseUrl: endpoints.sgoaFhir,
  accessToken: token.value.accessToken,
  httpClient: zm.httpClient,
});

// 2. Czy pacjent ma już ankietę?
const existing = await searchSurveyResponses(client, { patientPesel: pesel });
if (!existing.ok) {
  console.error(`Błąd wyszukania ankiet [${existing.error.kind}]:`, existing.error.message);
  process.exit(1);
}

let surveyId = existing.value.items[0]?.id;
if (surveyId !== undefined) {
  const survey = existing.value.items[0];
  console.log(
    `\nPacjent ma ankietę: id=${surveyId}, status realizacji=${survey?.surveyStatus ?? "-"}`,
  );
  console.log(
    `Zakres badań: CarePlan/${survey?.examPlanId ?? "-"}, zablokowana=${String(survey?.locked)}`,
  );
} else {
  // 3. Ankiety dostępne dla pacjenta ($eligible - uwzględnia wiek/płeć/karencję).
  const eligible = await findEligibleQuestionnaires(client, { pesel });
  if (!eligible.ok) {
    console.error(`Błąd $eligible [${eligible.error.kind}]:`, eligible.error.message);
    process.exit(1);
  }
  console.log(`\nDefinicje dostępne dla pacjenta: ${eligible.value.length}`);
  for (const definition of eligible.value) {
    console.log(
      `- ${definition.id}: ${definition.title} (${definition.gender}, ${definition.ageRange?.low}-${definition.ageRange?.high} lat)`,
    );
  }

  const definition = eligible.value[0];
  if (!definition?.url) {
    console.log("Brak dostępnych definicji - koniec.");
    process.exit(0);
  }
  if (e.P1_SGOA_SUBMIT !== "1") {
    console.log(
      "\nZapis ankiety pominięty (można ją wypełnić tylko raz) - ustaw P1_SGOA_SUBMIT=1.",
    );
    process.exit(0);
  }

  // 4. Wypełnienie i zapis ankiety - w odpowiedzi id zakresu badań (basedOn).
  const submitted = await submitSurveyResponse(client, {
    privacyPolicyAcceptanceDate: new Date().toISOString(),
    questionnaireUrl: definition.url,
    patient: { pesel, givenNames, familyName },
    items: fillDemoAnswers(definition),
  });
  if (!submitted.ok) {
    console.error(`Błąd zapisu ankiety [${submitted.error.kind}]:`, submitted.error.message);
    process.exit(1);
  }
  surveyId = submitted.value.id;
  console.log(
    `\nAnkieta zapisana: id=${surveyId}, zakres badań=CarePlan/${submitted.value.examPlanId ?? "-"}`,
  );
}

// 5. Wydruk PDF i podsumowanie strukturalne.
if (surveyId !== undefined) {
  const printout = await getSurveyPrintout(client, surveyId);
  if (printout.ok) {
    const outDir = resolve(import.meta.dirname, "../.local");
    mkdirSync(outDir, { recursive: true });
    const outFile = resolve(outDir, `moje-zdrowie-ankieta-${surveyId}.pdf`);
    writeFileSync(outFile, printout.value.pdf);
    console.log(`Wydruk ankiety zapisany: ${outFile} (${printout.value.pdf.length} B)`);
  } else {
    console.error(`Błąd wydruku [${printout.error.kind}]:`, printout.error.message);
  }

  const summary = await getSurveyStructuredSummary(client, surveyId);
  if (summary.ok) {
    console.log(`Podsumowanie strukturalne: ${summary.value.items.length} sekcji`);
  }
}
