import { generateKeyPairSync } from "node:crypto";
import type { CallContext, HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import { sendSignedSoap, type SoapCallTransport } from "./soap-call.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

const context: CallContext = {
  subject: { root: "1.2.3", extension: "P" },
  user: { root: "1.2.4", extension: "U" },
  workplace: { root: "1.2.5", extension: "M" },
  businessRole: "DOCTOR",
};

const transportWith = (httpClient: HttpClient): SoapCallTransport => ({
  context,
  httpClient,
  wsSecurityCertificate: { privateKeyPem, certificateBase64: "ZHVtbXk=" },
  endpoint: "https://p1.example/service",
  clock: { now: () => new Date("2026-01-01T00:00:00Z") },
});

const SOAP_NS = 'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"';
const okResponse =
  `<soap:Envelope ${SOAP_NS}><soap:Body><Resp>` +
  `<wynik><major>urn:csioz:p1:wynik:ok</major></wynik>` +
  `</Resp></soap:Body></soap:Envelope>`;

const capturing = (): { client: HttpClient; last: () => HttpRequest | undefined } => {
  let captured: HttpRequest | undefined;
  return {
    client: {
      send: (request) => {
        captured = request;
        return Promise.resolve({ status: 200, headers: {}, body: okResponse });
      },
    },
    last: () => captured,
  };
};

describe("sendSignedSoap", () => {
  it("builds a SOAP 1.1 request: SOAPAction header, text/xml, signed envelope", async () => {
    const { client, last } = capturing();
    const result = await sendSignedSoap(transportWith(client), {
      body: "<ws:Req/>",
      soapAction: "urn:doThing",
      namespaces: { ws: "urn:ns:ws" },
      transportErrorMessage: "boom",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.outcome?.major).toBe("urn:csioz:p1:wynik:ok");
    const req = last();
    expect(req?.url).toBe("https://p1.example/service");
    expect(req?.headers.SOAPAction).toBe("urn:doThing");
    expect(req?.headers["Content-Type"]).toBe("text/xml; charset=utf-8");
    expect(req?.body).toContain('xmlns:ws="urn:ns:ws"');
    expect(req?.body).toContain("<ds:Signature"); // koperta podpisana WS-Security
  });

  it("builds a SOAP 1.2 request: action in Content-Type, soap12 envelope namespace", async () => {
    const { client, last } = capturing();
    await sendSignedSoap(transportWith(client), {
      body: "<ws:Req/>",
      soapAction: "urn:doThing",
      soapVersion: "1.2",
      transportErrorMessage: "boom",
    });

    const req = last();
    expect(req?.headers.SOAPAction).toBeUndefined();
    expect(req?.headers["Content-Type"]).toBe(
      'application/soap+xml; charset=utf-8; action="urn:doThing"',
    );
    expect(req?.body).toContain("http://www.w3.org/2003/05/soap-envelope");
  });

  it("propagates a custom context namespace into envelope and signature", async () => {
    const { client, last } = capturing();
    await sendSignedSoap(transportWith(client), {
      body: "<ws:Req/>",
      soapAction: "urn:doThing",
      contextNamespace: "urn:custom:kontekst",
      transportErrorMessage: "boom",
    });

    expect(last()?.body).toContain('xmlns:kon="urn:custom:kontekst"');
  });

  it("wraps a network failure in a P1TransportError with the given message", async () => {
    const client: HttpClient = { send: () => Promise.reject(new Error("ECONNREFUSED")) };
    const result = await sendSignedSoap(transportWith(client), {
      body: "<ws:Req/>",
      soapAction: "urn:doThing",
      transportErrorMessage: "the request failed",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("transport");
      expect(result.error.message).toBe("the request failed");
    }
  });
});
