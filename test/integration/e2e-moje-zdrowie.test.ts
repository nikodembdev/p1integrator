/**
 * Test e2e: realne wywołania serwera FHIR SGO-A (Moje Zdrowie) na P1 INTEGRACJI:
 * token OAuth2 (scope fhir-sgoa) → $eligible → wyszukanie ankiet pacjenta →
 * (jeśli ankieta istnieje) odczyty, wydruk PDF i zakres badań.
 *
 * Domyślnie POMIJANY. Uruchom: `P1_E2E=1 pnpm test:e2e`.
 *
 * Ścieżka ZAPISU (wypełnienie ankiety + przejścia zakresu badań) wymaga DODATKOWO
 * `P1_SGOA_E2E_WRITE=1`, bo: ankieta `moje_zdrowie` może być wypełniona tylko RAZ
 * na pacjenta (REG.16975), a operacje statusowe wymagają, by pacjent miał aktywną
 * deklarację POZ w naszym podmiocie (REG.16996/17429). Bez spełnienia tych warunków
 * po stronie danych testowych CSIOZ ścieżka zapisu skończy się błędem biznesowym.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { requestAccessToken } from "@p1/medical-events";
import {
  acceptExamPlan,
  buildSgoaTokenRequest,
  createSgoaClient,
  findEligibleQuestionnaires,
  getExamPlan,
  getSurveyPrintout,
  getSurveyStructuredSummary,
  searchSurveyResponses,
  submitSurveyResponse,
  withdrawExamPlan,
  type SgoaClient,
  type SurveyDefinition,
  type SurveyDefinitionItem,
  type SurveyResponseItemInput,
} from "@p1/moje-zdrowie";
import { createNodeHttpClient, parseP12 } from "@p1/transport";
import { beforeAll, describe, expect, it } from "vitest";
import { p1Account as a, p1AccountComplete } from "./p1-account.js";

const RUN = process.env.P1_E2E === "1";
const WRITE = process.env.P1_SGOA_E2E_WRITE === "1";
const tokenEndpoint = process.env.P1_SGOA_TOKEN_ENDPOINT ?? "https://isus.ezdrowie.gov.pl/token";
const fhirBaseUrl = process.env.P1_SGOA_FHIR_URL ?? "https://isus.ezdrowie.gov.pl/sgoa/fhir";
// Pacjent testowy SGO-A (z projektu testów CEZ) - może być inny niż pacjent CWUb
// używany w SOAP-owych e2e; przy zapisie imię/nazwisko muszą zgadzać się z CWUb.
const patientPesel = process.env.P1_SGOA_PATIENT ?? a.patient.pesel;
const patientGiven = process.env.P1_SGOA_PATIENT_GIVEN ?? a.patient.given;
const patientFamily = process.env.P1_SGOA_PATIENT_FAMILY ?? a.patient.family;

const wssPath = resolve(a.certDir, "Podmiot_leczniczy_713-wss.p12");
const tlsPath = resolve(a.certDir, "Podmiot_leczniczy_713-tls.p12");
const certsPresent = existsSync(wssPath) && existsSync(tlsPath);

describe.skipIf(!RUN || !p1AccountComplete || !certsPresent)("e2e SGO-A (Moje Zdrowie)", () => {
  let client: SgoaClient;

  beforeAll(async () => {
    const tls = parseP12(readFileSync(tlsPath), a.certPassword);
    const wss = parseP12(readFileSync(wssPath), a.certPassword);
    const httpClient = createNodeHttpClient({
      tls: {
        key: tls.privateKeyPem,
        cert: tls.certificatePem,
        rejectUnauthorized: a.rejectUnauthorized,
      },
    });

    const tokenRequest = buildSgoaTokenRequest({
      tokenEndpoint,
      privateKeyPem: wss.privateKeyPem,
      subject: `${a.providerRoot}:${a.podmiotExt}`,
      userId: `${a.userRoot}:${a.npwz}`,
      userRole: "LEK",
      childOrganization: `${a.musRoot}:${a.podmiotExt}-${a.musExt}`,
    });
    if (!tokenRequest.ok) throw tokenRequest.error;
    const token = await requestAccessToken(tokenRequest.value, httpClient);
    if (!token.ok) throw token.error;

    client = createSgoaClient({
      baseUrl: fhirBaseUrl,
      accessToken: token.value.accessToken,
      httpClient,
    });
  });

  it("wyszukuje definicje dostępne dla pacjenta ($eligible)", async () => {
    const eligible = await findEligibleQuestionnaires(client, { pesel: patientPesel });
    expect(eligible.ok, !eligible.ok ? String(eligible.error) : "").toBe(true);
    if (!eligible.ok) return;
    // Lista może być pusta (pacjent ma już ankietę / wiek poza zakresem) - to poprawny wynik.
    for (const definition of eligible.value) {
      expect(definition.url).toContain("Questionnaire");
      expect(definition.programCode).toBe("moje_zdrowie");
    }
  });

  it("wyszukuje ankiety pacjenta i czyta powiązane zasoby", async () => {
    const found = await searchSurveyResponses(client, { patientPesel: patientPesel });
    expect(found.ok, !found.ok ? String(found.error) : "").toBe(true);
    if (!found.ok) return;

    const survey = found.value.items[0];
    if (!survey?.id) return; // brak ankiety - reszta odczytów nie ma czego czytać

    // Wydruk PDF ankiety.
    const printout = await getSurveyPrintout(client, survey.id);
    expect(printout.ok, !printout.ok ? String(printout.error) : "").toBe(true);
    if (printout.ok) {
      expect(printout.value.pdf.subarray(0, 4).toString("utf8")).toBe("%PDF");
    }

    // Podsumowanie strukturalne.
    const summary = await getSurveyStructuredSummary(client, survey.id);
    expect(summary.ok, !summary.ok ? String(summary.error) : "").toBe(true);

    // Zakres badań z basedOn.
    if (survey.examPlanId) {
      const plan = await getExamPlan(client, survey.examPlanId);
      expect(plan.ok, !plan.ok ? String(plan.error) : "").toBe(true);
      if (plan.ok) expect(plan.value.activities.length).toBeGreaterThan(0);
    }
  });

  describe.skipIf(!WRITE)("ścieżka zapisu (P1_SGOA_E2E_WRITE=1)", () => {
    it("wypełnia ankietę, przyjmuje i wycofuje realizację zakresu badań", async () => {
      // Ankietę można wypełnić raz - jeśli już jest, pracujemy na istniejącej (bez zapisu).
      const existing = await searchSurveyResponses(client, { patientPesel: patientPesel });
      expect(existing.ok).toBe(true);
      if (!existing.ok) return;

      let examPlanId = existing.value.items[0]?.examPlanId;
      if (existing.value.items.length === 0) {
        const eligible = await findEligibleQuestionnaires(client, { pesel: patientPesel });
        expect(eligible.ok).toBe(true);
        if (!eligible.ok) return;
        const definition = eligible.value[0];
        expect(definition, "brak definicji $eligible dla pacjenta testowego").toBeDefined();
        if (!definition?.url) return;

        const submitted = await submitSurveyResponse(client, {
          privacyPolicyAcceptanceDate: new Date().toISOString(),
          questionnaireUrl: definition.url,
          patient: {
            pesel: patientPesel,
            givenNames: [patientGiven],
            familyName: patientFamily,
          },
          items: fillDefinition(definition),
        });
        expect(submitted.ok, !submitted.ok ? String(submitted.error) : "").toBe(true);
        if (!submitted.ok) return;
        examPlanId = submitted.value.examPlanId;
      }

      expect(examPlanId, "brak id zakresu badań").toBeDefined();
      if (!examPlanId) return;

      // draft→active→draft (przy zajętym statusie zostawiamy zakres w spokoju).
      const plan = await getExamPlan(client, examPlanId);
      expect(plan.ok).toBe(true);
      if (!plan.ok || plan.value.status !== "draft") return;

      const accepted = await acceptExamPlan(client, plan.value, {
        startDate: new Date().toISOString().slice(0, 10),
        note: "e2e @p1/moje-zdrowie",
      });
      expect(accepted.ok, !accepted.ok ? String(accepted.error) : "").toBe(true);
      if (!accepted.ok) return;
      expect(accepted.value.status).toBe("active");

      const withdrawn = await withdrawExamPlan(client, accepted.value, { clearNote: true });
      expect(withdrawn.ok, !withdrawn.ok ? String(withdrawn.error) : "").toBe(true);
      if (withdrawn.ok) expect(withdrawn.value.status).toBe("draft");
    });
  });
});

/**
 * Wypełnia definicję ankiety deterministycznymi odpowiedziami: liczby w granicach
 * min/max, pierwszy wariant choice, boolean=false, string stały. Pola wyliczane
 * liczy dla znanego przypadku BMI (masa/wzrost ustawiane niżej); itemy warunkowe
 * (enableWhen) pomijamy - odpowiadamy tylko na bezwarunkowe.
 */
function fillDefinition(definition: SurveyDefinition): SurveyResponseItemInput[] {
  const WZROST = 175;
  const MASA = 80;
  const fill = (item: SurveyDefinitionItem): SurveyResponseItemInput | undefined => {
    if (item.enableWhen !== undefined) return undefined;
    const base = { linkId: item.linkId, text: item.text ?? item.linkId };
    if (item.type === "group") {
      const children = (item.items ?? []).map(fill).filter((i) => i !== undefined);
      return children.length > 0 ? { ...base, items: children } : undefined;
    }
    if (item.linkId === "wzrost") return { ...base, answers: [WZROST] };
    if (item.linkId === "masa-ciala") return { ...base, answers: [MASA] };
    if (item.linkId === "bmi") {
      const bmi = Math.round((MASA / (WZROST / 100) ** 2) * 10) / 10;
      return { ...base, answers: [{ decimal: bmi }] };
    }
    switch (item.type) {
      case "boolean":
        return { ...base, answers: [false] };
      case "integer":
        return { ...base, answers: [item.minValue ?? 1] };
      case "decimal":
        return { ...base, answers: [{ decimal: item.minValue ?? 1 }] };
      case "choice": {
        const first = item.answerOptions?.[0]?.value;
        return first !== undefined ? { ...base, answers: [first] } : undefined;
      }
      case "string":
        return { ...base, answers: ["brak"] };
      default:
        return undefined;
    }
  };
  return definition.items.map(fill).filter((item) => item !== undefined);
}
