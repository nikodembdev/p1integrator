import { generateKeyPairSync } from "node:crypto";
import type { CallContext, DocumentSigner, HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import { readIpomPlan, searchPatientPlans } from "./pobieranie.js";
import type { IpomTransport } from "./submit.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

const context: CallContext = {
  subject: { root: "1.2.3", extension: "P" },
  user: { root: "1.2.4", extension: "U" },
  workplace: { root: "1.2.5", extension: "M" },
  businessRole: "DOCTOR",
};
const documentSigner: DocumentSigner = { signXades: (xml) => Promise.resolve(xml) };

const transportWith = (httpClient: HttpClient): IpomTransport => ({
  context,
  documentSigner,
  httpClient,
  wsSecurityCertificate: { privateKeyPem, certificateBase64: "ZHVtbXk=" },
  endpoint: "https://p1.example/ObslugaPlanowOpiekiMedycznejWS",
  clock: { now: () => new Date("2026-01-01T00:00:00Z") },
});

const SOAP12 = 'xmlns:soap="http://www.w3.org/2003/05/soap-envelope"';

describe("readIpomPlan", () => {
  it("buduje żądanie odczytu i dekoduje base64 CDA + status", async () => {
    const cda = "<ClinicalDocument/>";
    const b64 = Buffer.from(cda, "utf8").toString("base64");
    const response =
      `<soap:Envelope ${SOAP12}><soap:Body><OdczytPlanuOpiekiMedycznejResponse>` +
      `<wynik><major>urn:csioz:p1:kod:major:Sukces</major></wynik>` +
      `<trescDokumentu>${b64}</trescDokumentu>` +
      `<statusDokumentu>OBOWIAZUJACY</statusDokumentu>` +
      `</OdczytPlanuOpiekiMedycznejResponse></soap:Body></soap:Envelope>`;
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (request) => {
        captured = request;
        return Promise.resolve({ status: 200, headers: {}, body: response });
      },
    };

    const result = await readIpomPlan(
      { root: "2.16.1", extension: "DOC-1" },
      transportWith(client),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cdaXml).toBe(cda);
    expect(result.value.status).toBe("OBOWIAZUJACY");

    expect(captured?.headers?.["Content-Type"]).toContain(
      'action="urn:odczytPlanuOpiekiMedycznej"',
    );
    expect(captured?.body).toContain("<identyfikatorDokumentu>");
    expect(captured?.body).toContain("<wsp:extension>DOC-1</wsp:extension>");
    expect(captured?.body).toContain("<wsp:root>2.16.1</wsp:root>");
  });
});

describe("searchPatientPlans", () => {
  it("buduje kryteria i parsuje listę dokumentów + liczbę stron", async () => {
    const response =
      `<soap:Envelope ${SOAP12}><soap:Body><WyszukaniePlanowOpiekiMedycznejResponse>` +
      `<wynik><major>urn:csioz:p1:kod:major:Sukces</major></wynik>` +
      `<dokumenty><dokument>` +
      `<identyfikatorPlanuOpiekiMedycznej><extension>PLAN-1</extension><root>2.16.26.1</root></identyfikatorPlanuOpiekiMedycznej>` +
      `<nazwaAutora>Nowak Piotr</nazwaAutora>` +
      `<dataWystawienia>2026-06-22T10:00:00</dataWystawienia>` +
      `<numerWersji>1</numerWersji>` +
      `<statusDokumentu>OBOWIAZUJACY</statusDokumentu>` +
      `</dokument></dokumenty>` +
      `<wlasciwosciWynikuWyszukiwania><liczbaDokumentow>1</liczbaDokumentow><liczbaStron>1</liczbaStron></wlasciwosciWynikuWyszukiwania>` +
      `</WyszukaniePlanowOpiekiMedycznejResponse></soap:Body></soap:Envelope>`;
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (request) => {
        captured = request;
        return Promise.resolve({ status: 200, headers: {}, body: response });
      },
    };

    const result = await searchPatientPlans(
      {
        patient: { root: "2.16.1.1.616", extension: "40010151673" },
        status: "OBOWIAZUJACY",
        page: 0,
      },
      transportWith(client),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalCount).toBe("1");
    expect(result.value.documents).toHaveLength(1);
    expect(result.value.documents[0]?.planId).toEqual({ extension: "PLAN-1", root: "2.16.26.1" });
    expect(result.value.documents[0]?.authorName).toBe("Nowak Piotr");
    expect(result.value.documents[0]?.status).toBe("OBOWIAZUJACY");

    expect(captured?.body).toContain("<identyfikatorUslugobiorcy>");
    expect(captured?.body).toContain("<statusDokumentu>OBOWIAZUJACY</statusDokumentu>");
    expect(captured?.body).toContain("<wsp:numerStrony>0</wsp:numerStrony>");
  });
});
