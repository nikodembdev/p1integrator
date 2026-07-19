// Moje Zdrowie (SGO-A): obsługa zakresu badań (CarePlan) po stronie POZ -
// ankiety oczekujące na podjęcie, odczyt zaleconych badań i sterowanie realizacją.
// pnpm tsx examples/23-moje-zdrowie-zakres-badan.ts
//
// Przejścia statusów (draft→active→…) wykonują się dopiero z P1_SGOA_REALIZACJA=1
// i wymagają, by pacjent miał aktywną deklarację POZ w naszym podmiocie (REG.16996).
import { requestAccessToken } from "@p1/medical-events";
import {
  acceptExamPlan,
  buildSgoaTokenRequest,
  createSgoaClient,
  getExamPlan,
  searchSurveyResponses,
  withdrawExamPlan,
} from "@p1/moje-zdrowie";
import { account, endpoints, patient, zmTransport } from "./config.js";

const e = process.env;
const pesel = e.P1_SGOA_PATIENT ?? patient.pesel;

const zm = zmTransport();
if (!zm) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - pominięto.");
  process.exit(0);
}

// 1. Token OAuth2 dla SGO-A.
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

const client = createSgoaClient({
  baseUrl: endpoints.sgoaFhir,
  accessToken: token.value.accessToken,
  httpClient: zm.httpClient,
});

// 2. Ankiety oczekujące na podjęcie w naszej placówce (pacjenci z deklaracją POZ):
//    subject-poz={id MUŚ} + locked=false. Tu dla demonstracji szukamy po PESEL-u.
const pending = await searchSurveyResponses(client, {
  patientPesel: pesel,
  include: ["exam-plan"],
});
if (!pending.ok) {
  console.error(`Błąd wyszukania [${pending.error.kind}]:`, pending.error.message);
  process.exit(1);
}
console.log(`Ankiety pacjenta: ${pending.value.items.length}`);

const survey = pending.value.items[0];
if (!survey?.examPlanId) {
  console.log("Brak ankiety z zakresem badań - koniec.");
  process.exit(0);
}

// 3. Odczyt zakresu badań - lista zaleconych badań ze słownika P1.
const plan = await getExamPlan(client, survey.examPlanId);
if (!plan.ok) {
  console.error(`Błąd odczytu zakresu badań [${plan.error.kind}]:`, plan.error.message);
  process.exit(1);
}
console.log(`\nZakres badań ${plan.value.id}: status=${plan.value.status}`);
for (const activity of plan.value.activities) {
  console.log(`- [${activity.code}] ${activity.display} (${activity.procedureType ?? "?"})`);
}

// 4. Realizacja: przyjęcie (draft→active, blokuje edycję ankiety) i wycofanie (→draft).
if (e.P1_SGOA_REALIZACJA !== "1") {
  console.log("\nPrzejścia statusów pominięte - ustaw P1_SGOA_REALIZACJA=1.");
  process.exit(0);
}
if (plan.value.status !== "draft") {
  console.log(`\nZakres badań w statusie ${plan.value.status} - demo przejść wymaga draft.`);
  process.exit(0);
}

const accepted = await acceptExamPlan(client, plan.value, {
  startDate: new Date().toISOString().slice(0, 10),
  note: "Przyjęto do realizacji (przykład @p1/moje-zdrowie)",
});
if (!accepted.ok) {
  console.error(`Błąd przyjęcia realizacji [${accepted.error.kind}]:`, accepted.error.message);
  process.exit(1);
}
console.log(
  `\nPrzyjęto do realizacji: status=${accepted.value.status}, od=${accepted.value.startDate}`,
);

const withdrawn = await withdrawExamPlan(client, accepted.value, { clearNote: true });
if (!withdrawn.ok) {
  console.error(`Błąd wycofania realizacji [${withdrawn.error.kind}]:`, withdrawn.error.message);
  process.exit(1);
}
console.log(`Wycofano realizację: status=${withdrawn.value.status} (edycja ankiety odblokowana)`);
