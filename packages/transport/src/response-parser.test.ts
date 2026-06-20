import { P1AuthenticationError, P1ServerError } from "@p1/core";
import { describe, expect, it } from "vitest";
import { parseSoapResponse } from "./response-parser.js";

const SOAP_NS = 'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"';

describe("parseSoapResponse", () => {
  it("extracts a business WynikMT as an OperationOutcome", () => {
    const xml = `<soap:Envelope ${SOAP_NS}><soap:Body><Resp><wynik><major>urn:csioz:p1:wynik:ok</major><komunikat>OK</komunikat></wynik></Resp></soap:Body></soap:Envelope>`;
    const result = parseSoapResponse(xml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.outcome?.major).toBe("urn:csioz:p1:wynik:ok");
      expect(result.value.outcome?.message).toBe("OK");
    }
  });

  it("maps a Fault carrying a technical BladMT to the matching P1 error", () => {
    const xml = `<soap:Envelope ${SOAP_NS}><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>err</faultstring><detail><Blad><kodBleduMajor>urn:csioz:p1:kodBleduMajor:bladUwierzytelnienia</kodBleduMajor><opis>Bad auth</opis></Blad></detail></soap:Fault></soap:Body></soap:Envelope>`;
    const result = parseSoapResponse(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(P1AuthenticationError);
      expect(result.error.message).toBe("Bad auth");
    }
  });

  it("maps an unrecognized Fault to P1ServerError", () => {
    const xml = `<soap:Envelope ${SOAP_NS}><soap:Body><soap:Fault><faultstring>boom</faultstring></soap:Fault></soap:Body></soap:Envelope>`;
    const result = parseSoapResponse(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(P1ServerError);
      expect(result.error.message).toBe("boom");
    }
  });
});
