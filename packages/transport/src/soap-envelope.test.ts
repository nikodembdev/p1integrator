import type { CallContext } from "@p1/core";
import { describe, expect, it } from "vitest";
import { buildSoapEnvelope } from "./soap-envelope.js";

const context: CallContext = {
  subject: { root: "1.2.3", extension: "P" },
  user: { root: "1.2.4", extension: "U" },
  workplace: { root: "1.2.5", extension: "M" },
  businessRole: "DOCTOR",
};

describe("buildSoapEnvelope", () => {
  it("includes a Security placeholder and Kontekst/Body with wsu:Id", () => {
    const xml = buildSoapEnvelope({ context, body: "<v:Req/>", namespaces: { v: "urn:test" } });
    expect(xml).toContain('<wsse:Security soapenv:mustUnderstand="1"></wsse:Security>');
    expect(xml).toContain('<kon:kontekstWywolania wsu:Id="KontekstWywolania">');
    expect(xml).toContain('<soapenv:Body wsu:Id="Body"><v:Req/></soapenv:Body>');
    expect(xml).toContain('xmlns:v="urn:test"');
  });

  it("serializes the business role as its P1 wire value", () => {
    const xml = buildSoapEnvelope({ context, body: "<x/>" });
    expect(xml).toContain("<kon:wartosc>LEKARZ_LEK_DENTYSTA_FELCZER</kon:wartosc>");
  });

  it("escapes value content", () => {
    const xml = buildSoapEnvelope({
      context: { ...context, user: { root: "1.2.4", extension: "a&b<c" } },
      body: "<x/>",
    });
    expect(xml).toContain("<kon:wartosc>a&amp;b&lt;c</kon:wartosc>");
  });
});
