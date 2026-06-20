import {
  err,
  ok,
  type OperationOutcome,
  type P1Error,
  P1TransportError,
  type Result,
} from "@p1/core";
import { buildSoapEnvelope, parseSoapResponse, signWsSecurity } from "@p1/transport";
import type { ReferralTransport } from "../submit.js";
import { buildNullificationCda, type NullificationInput } from "./document.js";

const WS_NS = "http://csioz.gov.pl/p1/eskierowanie/ws/v20180509";
const MT_NS = "http://csioz.gov.pl/p1/eskierowanie/mt/v20180509";
const WSP_NS = "http://csioz.gov.pl/p1/wspolne/mt/v20180509";
const SOAP_ACTION = "urn:zapisDokumentuAnulowaniaSkierowania";

/** Numer (OID) anulowanego skierowania nadany przez system wystawiający. */
export interface ReferralNumber {
  readonly root: string;
  readonly extension: string;
}

export interface NullificationSubmissionResult {
  /** Wynik biznesowy operacji (WynikMT). */
  readonly outcome?: OperationOutcome;
}

/**
 * Wysyła dokument CDA anulowania operacją `zapisDokumentuAnulowaniaSkierowania`:
 * podpis XAdES → koperta SOAP + WS-Security → mTLS → parsowanie WynikMT. Oprócz treści
 * (base64) request zawiera `numerSkierowania` — OID anulowanego skierowania.
 */
export async function submitNullificationDocument(
  cdaXml: string,
  referralNumber: ReferralNumber,
  transport: ReferralTransport,
): Promise<Result<NullificationSubmissionResult, P1Error>> {
  const signedCda = await transport.documentSigner.signXades(cdaXml);
  const base64 = Buffer.from(signedCda, "utf8").toString("base64");

  const body =
    `<ws:ZapisDokumentuAnulowaniaSkierowaniaRequest>` +
    `<dokumentAnulowaniaSkierowania><mt:tresc>${base64}</mt:tresc></dokumentAnulowaniaSkierowania>` +
    `<numerSkierowania><mt:numerSkierowania>` +
    `<wsp:extension>${referralNumber.extension}</wsp:extension>` +
    `<wsp:root>${referralNumber.root}</wsp:root>` +
    `</mt:numerSkierowania></numerSkierowania>` +
    `</ws:ZapisDokumentuAnulowaniaSkierowaniaRequest>`;

  const envelope = buildSoapEnvelope({
    context: transport.context,
    body,
    namespaces: { ws: WS_NS, mt: MT_NS, wsp: WSP_NS },
  });

  const now = transport.clock?.now();
  const signed = signWsSecurity(
    envelope,
    now !== undefined
      ? { certificate: transport.wsSecurityCertificate, now }
      : { certificate: transport.wsSecurityCertificate },
  );

  let responseBody: string;
  try {
    const response = await transport.httpClient.send({
      url: transport.endpoint,
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: SOAP_ACTION },
      body: signed,
    });
    responseBody = response.body;
  } catch (cause) {
    return err(new P1TransportError("Nullification submission request failed", { cause }));
  }

  const parsed = parseSoapResponse(responseBody);
  if (!parsed.ok) return parsed;
  return ok(parsed.value.outcome !== undefined ? { outcome: parsed.value.outcome } : {});
}

/** Wystawia anulowanie skierowania end-to-end (buduje CDA i wysyła). */
export function issueNullification(
  input: NullificationInput,
  transport: ReferralTransport,
): Promise<Result<NullificationSubmissionResult, P1Error>> {
  const cda = buildNullificationCda(input);
  return submitNullificationDocument(
    cda.xml,
    { root: input.annulledDocument.idRoot, extension: input.annulledDocument.idExtension },
    transport,
  );
}
