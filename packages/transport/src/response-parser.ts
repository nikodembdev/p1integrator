import {
  type OperationOutcome,
  type P1Error,
  P1ServerError,
  type Result,
  type TechnicalErrorCode,
  err,
  ok,
  parseErrorCodeMajor,
  parseErrorCodeMinor,
  technicalErrorToP1Error,
} from "@p1/core";
import { XMLParser } from "fast-xml-parser";

export interface ParsedSoapResponse {
  /** Biznesowy `WynikMT`, jeśli obecny w odpowiedzi. */
  readonly outcome: OperationOutcome | undefined;
  /** Sparsowane Body (z usuniętymi prefiksami NS) do interpretacji w module. */
  readonly body: unknown;
  readonly raw: string;
}

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
});

/**
 * Parsuje odpowiedź SOAP P1. SOAP Fault → odpowiedni `P1Error` (techniczny
 * `BladMT` mapowany przez `@p1/core`); w przeciwnym razie wynik biznesowy
 * (`WynikMT`) jako `OperationOutcome` plus surowe Body do dalszej obróbki.
 */
export function parseSoapResponse(xml: string): Result<ParsedSoapResponse, P1Error> {
  const parsed: unknown = parser.parse(xml);

  const fault = findValue(parsed, "Fault");
  if (fault !== undefined) {
    return err(faultToError(fault));
  }

  return ok({
    outcome: extractOutcome(parsed),
    body: findValue(parsed, "Body"),
    raw: xml,
  });
}

function faultToError(fault: unknown): P1Error {
  const majorUrn = firstString(findValue(fault, "kodBleduMajor"));
  const major = majorUrn ? parseErrorCodeMajor(majorUrn) : undefined;

  if (major) {
    const minorUrn = firstString(findValue(fault, "kodBleduMinor"));
    const minor = minorUrn ? parseErrorCodeMinor(minorUrn) : undefined;
    const description =
      firstString(findValue(fault, "opis")) ?? firstString(findValue(fault, "faultstring"));
    const code: TechnicalErrorCode = {
      major,
      ...(minor ? { minor } : {}),
      ...(description ? { description } : {}),
    };
    return technicalErrorToP1Error(code);
  }

  const message =
    firstString(findValue(fault, "faultstring")) ??
    firstString(findValue(fault, "Text")) ??
    "SOAP Fault";
  return new P1ServerError(message);
}

function extractOutcome(parsed: unknown): OperationOutcome | undefined {
  const node = findRecordWithKey(parsed, "major");
  if (!node) return undefined;
  const major = firstString(node["major"]);
  if (!major) return undefined;
  const minor = firstString(node["minor"]);
  const message = firstString(node["komunikat"]);
  return { major, ...(minor ? { minor } : {}), ...(message ? { message } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findValue(node: unknown, key: string): unknown {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findValue(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (isRecord(node)) {
    if (key in node) return node[key];
    for (const value of Object.values(node)) {
      const found = findValue(value, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function findRecordWithKey(node: unknown, key: string): Record<string, unknown> | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecordWithKey(item, key);
      if (found) return found;
    }
    return undefined;
  }
  if (isRecord(node)) {
    if (key in node) return node;
    for (const value of Object.values(node)) {
      const found = findRecordWithKey(value, key);
      if (found) return found;
    }
  }
  return undefined;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = firstString(item);
      if (text) return text;
    }
    return undefined;
  }
  if (isRecord(value) && "#text" in value) return firstString(value["#text"]);
  return undefined;
}
