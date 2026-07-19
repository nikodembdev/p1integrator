import { describe, expect, it } from "vitest";
import { jsonResponse, recordingHttp, testClient } from "./test-helpers.js";
import { expandValueSet } from "./valueset.js";

describe("expandValueSet", () => {
  it("woła $expand z filtrem i parsuje pozycje słownika", async () => {
    const http = recordingHttp(
      jsonResponse({
        resourceType: "ValueSet",
        expansion: {
          contains: [
            {
              system: "https://ezdrowie.gov.pl/fhir/CodeSystem/PLSGOASurveyStatusCodeSystem",
              code: "wypelniona",
              display: "Wypełniona",
            },
            {
              system: "https://ezdrowie.gov.pl/fhir/CodeSystem/PLSGOASurveyStatusCodeSystem",
              code: "w_realizacji",
              display: "W realizacji",
            },
          ],
        },
      }),
    );
    const result = await expandValueSet(testClient(http), "PLSGOASurveyStatus", {
      filter: "real",
      count: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((entry) => entry.code)).toEqual(["wypelniona", "w_realizacji"]);

    const url = new URL(http.requests[0]?.url ?? "");
    expect(url.pathname.endsWith("/ValueSet/PLSGOASurveyStatus/$expand")).toBe(true);
    expect(url.searchParams.get("filter")).toBe("real");
    expect(url.searchParams.get("count")).toBe("10");
  });
});
