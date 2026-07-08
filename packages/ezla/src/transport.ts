import { err, ok, type P1Error, P1ServerError, P1TransportError, type Result } from "@p1/core";
import { XMLParser } from "fast-xml-parser";
import { SOAP_ACTION_PREFIX, ZUS_GABINETOWE_NS } from "./constants.js";
import type { EzlaTransport, ZusResult } from "./types.js";

const SOAPENV_NS = "http://schemas.xmlsoap.org/soap/envelope/";

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
});

/** Sparsowana odpowiedź operacji kanału gabinetowego. */
export interface ZusResponse {
  /** Zawartość elementu `{operacja}Response` (po zdjęciu prefiksów NS). */
  readonly body: unknown;
  /** Wynik operacji (`Rezultat`: kod/opis błędu). */
  readonly result: ZusResult;
  readonly raw: string;
}

/**
 * Buduje kopertę SOAP 1.1 kanału gabinetowego ZUS:
 * `<soapenv:Envelope><soapenv:Body><gab:{operacja}>{body}</gab:{operacja}></...>`.
 */
export function buildZusSoapEnvelope(operation: string, body: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${SOAPENV_NS}" xmlns:gab="${ZUS_GABINETOWE_NS}">` +
    `<soapenv:Header/>` +
    `<soapenv:Body><gab:${operation}>${body}</gab:${operation}></soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

/**
 * Wysyła operację kanału gabinetowego: koperta SOAP 1.1 + HTTP Basic Auth +
 * `SOAPAction` → POST przez `HttpClient` → parsowanie odpowiedzi i `Rezultat`.
 */
export async function sendZusRequest(
  operation: string,
  body: string,
  transport: EzlaTransport,
): Promise<Result<ZusResponse, P1Error>> {
  const envelope = buildZusSoapEnvelope(operation, body);
  const auth = Buffer.from(
    `${transport.credentials.login}:${transport.credentials.password}`,
    "utf8",
  ).toString("base64");

  let responseBody: string;
  try {
    const response = await transport.httpClient.send({
      url: transport.endpoint,
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `${SOAP_ACTION_PREFIX}${operation}`,
        Authorization: `Basic ${auth}`,
      },
      body: envelope,
    });
    responseBody = response.body;
  } catch (cause) {
    return err(
      new P1TransportError(`Żądanie ZUS e-ZLA (${operation}) nie powiodło się`, { cause }),
    );
  }

  return parseZusResponse(responseBody);
}

/** Parsuje odpowiedź SOAP ZUS: SOAP Fault → błąd; w przeciwnym razie Body + `Rezultat`. */
export function parseZusResponse(xml: string): Result<ZusResponse, P1Error> {
  const parsed: unknown = parser.parse(xml);

  const fault = findValue(parsed, "Fault");
  if (fault !== undefined) {
    const message =
      findText(fault, "faultstring") ?? findText(fault, "Reason") ?? "SOAP Fault (ZUS e-ZLA)";
    return err(new P1ServerError(message));
  }

  const body = findValue(parsed, "Body");
  return ok({ body, result: zusResult(body), raw: xml });
}

/** Buduje `ZusResult` (KodBledu/OpisBledu) z poddrzewa odpowiedzi. */
export function zusResult(node: unknown): ZusResult {
  const errorCode = findText(node, "KodBledu");
  const errorMessage = findText(node, "OpisBledu");
  return {
    ...(errorCode !== undefined ? { errorCode } : {}),
    ...(errorMessage !== undefined ? { errorMessage } : {}),
  };
}

/** Znajduje pierwszą wartość (poddrzewo) o danym kluczu lokalnym. */
export function findValue(node: unknown, key: string): unknown {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findValue(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (node !== null && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (key in record) return record[key];
    for (const value of Object.values(record)) {
      const found = findValue(value, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** Znajduje pierwszą wartość tekstową o danym kluczu lokalnym. */
export function findText(node: unknown, key: string): string | undefined {
  const value = findValue(node, key);
  return coerce(value);
}

function coerce(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("#text" in record) return coerce(record["#text"]);
  }
  return undefined;
}
