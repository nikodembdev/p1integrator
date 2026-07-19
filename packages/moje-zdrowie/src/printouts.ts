import { err, ok, type P1Error, P1ServerError, type Result } from "@p1/core";
import type { SgoaClient } from "./client.js";
import { SGOA_EXT } from "./constants.js";
import { asArray, asObject, asString, extensions, subjectPesel } from "./fhir.js";
import { parseResponseItem } from "./survey-response.js";
import type { SurveyPdf, SurveySummary } from "./types.js";

/**
 * Wydruki i podsumowania ankiety - generowane przez P1 na żądanie:
 * `$printout` (wydruk wypełnionej ankiety), `$summary` (wydruk podsumowania
 * z zaleceniami badań), `$structured-summary` (podsumowanie jako zasób).
 */

/** Pobiera wydruk wypełnionej ankiety jako PDF (`$printout`). */
export function getSurveyPrintout(
  client: SgoaClient,
  surveyResponseId: string,
): Promise<Result<SurveyPdf, P1Error>> {
  return fetchPdf(client, surveyResponseId, "$printout");
}

/** Pobiera wydruk podsumowania ankiety jako PDF (`$summary`). */
export function getSurveySummaryPdf(
  client: SgoaClient,
  surveyResponseId: string,
): Promise<Result<SurveyPdf, P1Error>> {
  return fetchPdf(client, surveyResponseId, "$summary");
}

async function fetchPdf(
  client: SgoaClient,
  surveyResponseId: string,
  operation: "$printout" | "$summary",
): Promise<Result<SurveyPdf, P1Error>> {
  const result = await client.get(`QuestionnaireResponse/${surveyResponseId}/${operation}`);
  if (!result.ok) return result;

  // Odpowiedź: PLSGOADocumentReference z PDF w content.attachment.data (base64).
  const document = asObject(result.value);
  const attachment = asArray(document?.["content"])
    .map(asObject)
    .map((content) => asObject(content?.["attachment"]))
    .find(Boolean);
  const data = asString(attachment?.["data"]);
  if (data === undefined) {
    return err(new P1ServerError(`Brak treści PDF w odpowiedzi operacji ${operation}`));
  }
  return ok({
    pdf: Buffer.from(data, "base64"),
    contentType: asString(attachment?.["contentType"]) ?? "application/pdf",
  });
}

/**
 * Pobiera podsumowanie strukturalne ankiety (`$structured-summary`):
 * odpowiedzi, zalecenia badań i dane pacjenta jako QuestionnaireResponse
 * (profil PLSGOASurveySummary).
 */
export async function getSurveyStructuredSummary(
  client: SgoaClient,
  surveyResponseId: string,
): Promise<Result<SurveySummary, P1Error>> {
  const result = await client.get(`QuestionnaireResponse/${surveyResponseId}/$structured-summary`);
  if (!result.ok) return result;

  const resource = result.value;
  const summary = asObject(resource) ?? {};
  const pesel = subjectPesel(summary);
  const display = asObject(asObject(summary["subject"])?.["_display"]);
  const familyName = asString(
    asObject(extensions(display, SGOA_EXT.DISPLAY_FAMILY_NAME)[0])?.["valueString"],
  );
  const givenNames = extensions(display, SGOA_EXT.DISPLAY_GIVEN_NAME)
    .map((ext) => asString(ext["valueString"]))
    .filter((name): name is string => name !== undefined);

  return ok({
    ...(pesel !== undefined ? { patientPesel: pesel } : {}),
    ...(familyName !== undefined ? { familyName } : {}),
    givenNames,
    items: asArray(summary["item"]).map(parseResponseItem),
    resource,
  });
}
