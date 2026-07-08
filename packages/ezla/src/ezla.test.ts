import type { HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import { ISSUE_MODE } from "./constants.js";
import { wyslijDokumenty } from "./documents.js";
import { loginWithSignature } from "./session.js";
import { buildZusSoapEnvelope, parseZusResponse } from "./transport.js";
import type { EzlaTransport } from "./types.js";
import { buildZlaKedu } from "./zla-document.js";

const zlaInput = {
  documentId: "13525",
  seriaNumer: { seria: "ZW", numer: "9998137" },
  copy: "ORYGINAL" as const,
  insured: { pesel: "74030617730", firstName: "IRENEUSZ", lastName: "BARON" },
  insuredAddress: {
    postalCode: "43253",
    city: "PIELGRZYMOWICE",
    street: "GRUNTOWA",
    houseNumber: "3",
  },
  incapacity: { from: "2015-11-28", to: "2015-11-29" },
  payer: {
    name: "NZOZ ESKULAP",
    postalCode: "00950",
    city: "WARSZAWA",
    street: "JASNA",
    houseNumber: "44",
  },
  doctor: { npwz: "9316759", firstName: "WOJCIECH", lastName: "WALUK" },
  issueDate: "2015-12-02",
};

const transportWith = (httpClient: HttpClient): EzlaTransport => ({
  httpClient,
  endpoint: "https://193.105.143.152:8001/ws/zus.channel.gabinetoweV4:zla",
  credentials: { login: "ezla_ag", password: "ezla_ag" },
});

describe("buildZlaKedu", () => {
  it("buduje dokument KEDU ZLA z sekcjami I-VIII", () => {
    const { keduXml, documentId } = buildZlaKedu(zlaInput);
    expect(documentId).toBe("13525");
    expect(keduXml).toContain('xmlns="http://www.zus.pl/2015/KED_ZLA_1"');
    expect(keduXml).toContain('<ZUSZLA id_dokumentu="13525">');
    expect(keduXml).toContain("<p1>ZW</p1>");
    expect(keduXml).toContain("<p2>9998137</p2>");
    expect(keduXml).toContain("<p1>74030617730</p1>"); // PESEL w sekcji II
    expect(keduXml).toContain("<p1>2015-11-28</p1>"); // okres od
    expect(keduXml).toContain("<p1>9316759</p1>"); // NPWZ lekarza
    expect(keduXml).toContain("<p3>2</p3>"); // liczba dni (28-29 listopada = 2)
  });
});

describe("buildZusSoapEnvelope", () => {
  it("buduje kopertę SOAP 1.1 z operacją w namespace gab", () => {
    const env = buildZusSoapEnvelope("usunSesje", "<IdSesji>S1</IdSesji>");
    expect(env).toContain('xmlns:gab="http://zus.pl/b2b/zus/channel/gabinetowe"');
    expect(env).toContain("<gab:usunSesje><IdSesji>S1</IdSesji></gab:usunSesje>");
  });
});

describe("parseZusResponse", () => {
  it("wyciąga Rezultat (KodBledu/OpisBledu)", () => {
    const xml =
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
      "<ns:walidujDokumentyResponse><Rezultat><KodBledu>0</KodBledu><OpisBledu>OK</OpisBledu></Rezultat>" +
      "</ns:walidujDokumentyResponse></soap:Body></soap:Envelope>";
    const r = parseZusResponse(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.result.errorCode).toBe("0");
    expect(r.value.result.errorMessage).toBe("OK");
  });

  it("mapuje SOAP Fault na błąd serwera", () => {
    const xml =
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
      "<soap:Fault><faultstring>Brak sesji</faultstring></soap:Fault></soap:Body></soap:Envelope>";
    const r = parseZusResponse(xml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("server");
    expect(r.error.message).toContain("Brak sesji");
  });
});

describe("wyslijDokumenty", () => {
  it("buduje żądanie z sesją, trybem i osadzonym podpisanym KEDU", async () => {
    const signed = '<?xml version="1.0"?><KEDU>doc</KEDU>';
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (request) => {
        captured = request;
        return Promise.resolve({
          status: 200,
          headers: {},
          body:
            '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
            "<wyslijDokumentyResponse><Rezultat><KodBledu/></Rezultat>" +
            "<RezultatWysylki><KodBledu>0</KodBledu></RezultatWysylki>" +
            "</wyslijDokumentyResponse></s:Body></s:Envelope>",
        });
      },
    };

    const result = await wyslijDokumenty(
      { idSesji: "S1" },
      ISSUE_MODE.CURRENT,
      [signed],
      transportWith(client),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sendResults).toHaveLength(1);

    expect(captured?.headers?.["Authorization"]).toBe(
      `Basic ${Buffer.from("ezla_ag:ezla_ag").toString("base64")}`,
    );
    expect(captured?.headers?.["SOAPAction"]).toBe("zus_channel_zla_Binder_wyslijDokumenty");
    expect(captured?.body).toContain("<IdSesji>S1</IdSesji>");
    expect(captured?.body).toContain("<Tryb>Biezacy</Tryb>");
    // KEDU osadzony bez deklaracji XML, w <Dokument><KEDU>...
    expect(captured?.body).toContain("<Dokument><KEDU><KEDU>doc</KEDU></KEDU></Dokument>");
  });
});

describe("loginWithSignature", () => {
  it("wysyła zalogujPodpisem i zwraca IdSesji", async () => {
    const client: HttpClient = {
      send: () =>
        Promise.resolve({
          status: 200,
          headers: {},
          body:
            '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
            "<zalogujPodpisemResponse><IdSesji>SESJA-1</IdSesji><Rezultat><KodBledu/></Rezultat>" +
            "</zalogujPodpisemResponse></s:Body></s:Envelope>",
        }),
    };
    const result = await loginWithSignature(
      { signedStatement: "<signed/>", method: "certyfikat", npwz: "9316759" },
      transportWith(client),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.idSesji).toBe("SESJA-1");
  });
});
