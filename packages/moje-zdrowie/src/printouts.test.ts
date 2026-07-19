import { describe, expect, it } from "vitest";
import { getSurveyPrintout, getSurveyStructuredSummary, getSurveySummaryPdf } from "./printouts.js";
import { DOCUMENT_REFERENCE_FIXTURE } from "./test-fixtures.js";
import { jsonResponse, recordingHttp, testClient } from "./test-helpers.js";

const STRUCTURED_SUMMARY = {
  resourceType: "QuestionnaireResponse",
  meta: { profile: ["https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOASurveySummary"] },
  status: "completed",
  subject: {
    identifier: { system: "urn:oid:2.16.840.1.113883.3.4424.1.1.616", value: "90080517455" },
    _display: {
      extension: [
        {
          url: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAReferenceDisplayFamilyName",
          valueString: "Nowak",
        },
        {
          url: "https://ezdrowie.gov.pl/fhir/StructureDefinition/PLSGOAReferenceDisplayGivenName",
          valueString: "Bartosz",
        },
      ],
    },
  },
  item: [
    {
      linkId: "zalecenia",
      text: "Zalecane badania",
      item: [
        { linkId: "badanie-1", text: "Morfologia krwi", answer: [{ valueString: "podstawowe" }] },
      ],
    },
  ],
};

describe("getSurveyPrintout / getSurveySummaryPdf", () => {
  it("woła $printout i dekoduje PDF z base64", async () => {
    const http = recordingHttp(jsonResponse(DOCUMENT_REFERENCE_FIXTURE));
    const result = await getSurveyPrintout(testClient(http), "12345");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.contentType).toBe("application/pdf");
    expect(result.value.pdf.toString("utf8")).toBe("%PDF-1.4 test");
    expect(http.requests[0]?.url).toBe(
      "https://isus.example/sgoa/fhir/QuestionnaireResponse/12345/$printout",
    );
  });

  it("woła $summary", async () => {
    const http = recordingHttp(jsonResponse(DOCUMENT_REFERENCE_FIXTURE));
    const result = await getSurveySummaryPdf(testClient(http), "12345");
    expect(result.ok).toBe(true);
    expect(http.requests[0]?.url).toContain("/QuestionnaireResponse/12345/$summary");
  });

  it("brak treści PDF w odpowiedzi to błąd serwera", async () => {
    const http = recordingHttp(jsonResponse({ resourceType: "DocumentReference", content: [] }));
    const result = await getSurveyPrintout(testClient(http), "12345");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("server");
  });
});

describe("getSurveyStructuredSummary", () => {
  it("woła $structured-summary i parsuje podsumowanie z danymi pacjenta", async () => {
    const http = recordingHttp(jsonResponse(STRUCTURED_SUMMARY));
    const result = await getSurveyStructuredSummary(testClient(http), "12345");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.patientPesel).toBe("90080517455");
    expect(result.value.familyName).toBe("Nowak");
    expect(result.value.givenNames).toEqual(["Bartosz"]);
    expect(result.value.items[0]?.items[0]?.answers).toEqual(["podstawowe"]);
    expect(http.requests[0]?.url).toContain("/QuestionnaireResponse/12345/$structured-summary");
  });
});
