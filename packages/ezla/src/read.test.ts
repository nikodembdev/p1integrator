import type { HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import { ACCESS_CONTEXT, DOCUMENT_KIND } from "./constants.js";
import {
  checkCancellationPossibility,
  getCancellationReasons,
  getDocument,
  getInsuredPayers,
  getLoginStatement,
  getPayerData,
} from "./read.js";
import type { EzlaTransport } from "./types.js";

const SOAP = (inner: string) =>
  `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${inner}</s:Body></s:Envelope>`;

const transportWith = (
  responder: (req: HttpRequest) => string,
  captured?: { req?: HttpRequest },
): EzlaTransport => ({
  httpClient: {
    send: (req) => {
      if (captured) captured.req = req;
      return Promise.resolve({ status: 200, headers: {}, body: responder(req) });
    },
  } satisfies HttpClient,
  endpoint: "https://zus.example/ws",
  credentials: { login: "ezla_ag", password: "ezla_ag" },
});

const session = { idSesji: "S1" };

describe("getPayerData", () => {
  it("buduje żądanie po NIP i parsuje dane płatnika", async () => {
    const captured: { req?: HttpRequest } = {};
    const t = transportWith(
      () =>
        SOAP(
          "<pobierzDanePlatnikaResponse><DanePlatnika><PlatnikIstnieje>true</PlatnikIstnieje>" +
            "<Nazwa>FIRMA</Nazwa><MaProfilPue>true</MaProfilPue></DanePlatnika>" +
            "<Rezultat><KodBledu/></Rezultat></pobierzDanePlatnikaResponse>",
        ),
      captured,
    );
    const r = await getPayerData(session, { nip: "1234567890" }, t);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.payer).toMatchObject({ exists: true, name: "FIRMA", hasPueProfile: true });
    expect(captured.req?.body).toContain("<IdSesji>S1</IdSesji>");
    expect(captured.req?.body).toContain("<Platnik><Nip>1234567890</Nip></Platnik>");
    expect(captured.req?.headers?.["SOAPAction"]).toBe(
      "zus_channel_zla_Binder_pobierzDanePlatnika",
    );
  });
});

describe("getInsuredPayers", () => {
  it("parsuje listę płatników ubezpieczonego", async () => {
    const t = transportWith(() =>
      SOAP(
        "<pobierzPlatnikowUbezpieczonegoResponse><Rezultat><KodBledu/></Rezultat>" +
          "<Platnik><Nazwa>A</Nazwa><NIP>111</NIP></Platnik>" +
          "<Platnik><Nazwa>B</Nazwa><Pesel>222</Pesel></Platnik>" +
          "</pobierzPlatnikowUbezpieczonegoResponse>",
      ),
    );
    const r = await getInsuredPayers(session, { insured: { pesel: "74030617730" } }, t);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.payers).toHaveLength(2);
    expect(r.value.payers[0]).toMatchObject({ name: "A", nip: "111" });
    expect(r.value.payers[1]).toMatchObject({ name: "B", pesel: "222" });
  });
});

describe("checkCancellationPossibility", () => {
  it("zwraca true gdy ZUS potwierdza możliwość", async () => {
    const t = transportWith(() =>
      SOAP(
        "<sprawdzMozliwoscAnulowaniaResponse><MozliwoscAnulowania>true</MozliwoscAnulowania>" +
          "<Rezultat><KodBledu/></Rezultat></sprawdzMozliwoscAnulowaniaResponse>",
      ),
    );
    const r = await checkCancellationPossibility(session, { seria: "ZW", numer: "9998137" }, t);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.possible).toBe(true);
  });
});

describe("getCancellationReasons", () => {
  it("parsuje słownik przyczyn anulowania", async () => {
    const t = transportWith(() =>
      SOAP(
        "<pobierzSlownikPrzyczynAnulowaniaResponse><Rezultat><KodBledu/></Rezultat>" +
          "<PrzyczynaAnulowania><Kod>1</Kod><Opis>Błąd danych</Opis></PrzyczynaAnulowania>" +
          "</pobierzSlownikPrzyczynAnulowaniaResponse>",
      ),
    );
    const r = await getCancellationReasons(session, t);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.reasons[0]).toMatchObject({ code: "1", description: "Błąd danych" });
  });
});

describe("getDocument", () => {
  it("buduje żądanie z rodzajem, serią/numerem i kontekstem", async () => {
    const captured: { req?: HttpRequest } = {};
    const t = transportWith(
      () =>
        SOAP("<pobierzDokumentResponse><Rezultat><KodBledu/></Rezultat></pobierzDokumentResponse>"),
      captured,
    );
    await getDocument(
      session,
      DOCUMENT_KIND.ZLA,
      { seria: "ZW", numer: "1" },
      ACCESS_CONTEXT.SEARCH,
      t,
    );
    expect(captured.req?.body).toContain("<RodzajDokumentu>ZLA</RodzajDokumentu>");
    expect(captured.req?.body).toContain("<Seria>ZW</Seria><Numer>1</Numer>");
    expect(captured.req?.body).toContain("<KontekstDostepu>WyszukanieZla</KontekstDostepu>");
  });
});

describe("getLoginStatement", () => {
  it("zwraca treść oświadczenia do podpisania", async () => {
    const t = transportWith(() =>
      SOAP(
        "<pobierzOswiadczenieResponse><Oswiadczenie>TRESC</Oswiadczenie></pobierzOswiadczenieResponse>",
      ),
    );
    const r = await getLoginStatement(t);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe("TRESC");
  });
});
