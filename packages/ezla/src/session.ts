import { err, ok, type P1Error, P1AuthenticationError, type Result } from "@p1/core";
import type { AuthMethod, EzlaSession, EzlaTransport } from "./types.js";
import { findText, sendZusRequest } from "./transport.js";
import { escapeXml } from "./xml.js";

/** Parametry logowania podpisem (`zalogujPodpisem`). */
export interface LoginParams {
  /**
   * Podpisane oświadczenie logowania (`PodpisaneOswiadczenie`, xsd:string) -
   * treść oświadczenia (z `pobierzOswiadczenie`) podpisana certyfikatem przez
   * konsumenta (port `EzlaSigner.signLoginStatement`).
   */
  readonly signedStatement: string;
  /** Metoda uwierzytelnienia (`certyfikat`/`ePuap`). */
  readonly method: AuthMethod;
  /** Numer prawa wykonywania zawodu lekarza (opcjonalny). */
  readonly npwz?: string;
}

/**
 * Loguje się do kanału gabinetowego podpisem (`zalogujPodpisem`) i zwraca sesję
 * (`IdSesji`) używaną przez kolejne operacje. Treść oświadczenia uzyskuje się z
 * `pobierzOswiadczenie` i podpisuje certyfikatem (poza tym modułem).
 */
export async function loginWithSignature(
  params: LoginParams,
  transport: EzlaTransport,
): Promise<Result<EzlaSession, P1Error>> {
  const body =
    `<PodpisaneOswiadczenie>${escapeXml(params.signedStatement)}</PodpisaneOswiadczenie>` +
    `<MetodaWeryfikacji>${params.method}</MetodaWeryfikacji>` +
    (params.npwz
      ? `<NumerPrawaWykonywaniaZawodu>${escapeXml(params.npwz)}</NumerPrawaWykonywaniaZawodu>`
      : "");

  const response = await sendZusRequest("zalogujPodpisem", body, transport);
  if (!response.ok) return response;

  // ZUS przy odrzuceniu zwraca puste <IdSesji/> + Rezultat z kodem/opisem błędu.
  const idSesji = findText(response.value.body, "IdSesji");
  if (idSesji === undefined || idSesji === "") {
    const { errorCode, errorMessage } = response.value.result;
    const reason = errorMessage ?? "brak IdSesji w odpowiedzi";
    return err(
      new P1AuthenticationError(
        `Logowanie do ZUS e-ZLA nieudane${errorCode ? ` [${errorCode}]` : ""}: ${reason}`,
      ),
    );
  }
  return ok({ idSesji });
}

/** Wylogowuje sesję (`usunSesje`). */
export async function logout(
  session: EzlaSession,
  transport: EzlaTransport,
): Promise<Result<void, P1Error>> {
  const response = await sendZusRequest(
    "usunSesje",
    `<IdSesji>${escapeXml(session.idSesji)}</IdSesji>`,
    transport,
  );
  return response.ok ? ok(undefined) : response;
}
