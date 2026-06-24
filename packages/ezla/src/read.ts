import { ok, type P1Error, type Result } from "@p1/core";
import type {
  AccessContext,
  CancellationReason,
  DocumentKind,
  EzlaSession,
  EzlaTransport,
  InsuredId,
  InsuredPayer,
  Pagination,
  PayerId,
  PayerInfo,
  SeriaNumerZla,
  ZusResult,
} from "./types.js";
import { findText, findValue, sendZusRequest } from "./transport.js";
import { escapeXml } from "./xml.js";

/** Pobiera dane płatnika (`pobierzDanePlatnika`) po PESEL/paszporcie/NIP. */
export async function getPayerData(
  session: EzlaSession,
  payer: PayerId,
  transport: EzlaTransport,
): Promise<Result<{ payer: PayerInfo; result: ZusResult }, P1Error>> {
  const body = sessionEl(session) + `<Platnik>${payerIdEls(payer)}</Platnik>`;
  const response = await sendZusRequest("pobierzDanePlatnika", body, transport);
  if (!response.ok) return response;
  return ok({
    payer: parsePayer(findValue(response.value.body, "DanePlatnika")),
    result: response.value.result,
  });
}

/** Pobiera płatników ubezpieczonego (`pobierzPlatnikowUbezpieczonego`). */
export async function getInsuredPayers(
  session: EzlaSession,
  params: { insured: InsuredId; insurancePlace?: string; leaveIssueDate?: string },
  transport: EzlaTransport,
): Promise<Result<{ payers: readonly InsuredPayer[]; result: ZusResult }, P1Error>> {
  const body =
    sessionEl(session) +
    `<Ubezpieczony>${insuredIdEls(params.insured)}</Ubezpieczony>` +
    (params.insurancePlace
      ? `<MiejsceUbezpieczenia>${escapeXml(params.insurancePlace)}</MiejsceUbezpieczenia>`
      : "") +
    (params.leaveIssueDate
      ? `<DataWystawieniaZla>${params.leaveIssueDate}</DataWystawieniaZla>`
      : "");

  const response = await sendZusRequest("pobierzPlatnikowUbezpieczonego", body, transport);
  if (!response.ok) return response;
  const payers = collect(response.value.body, "Platnik").map((p) => ({
    ...parsePayer(p),
    ...optText(p, "NIP", "nip"),
    ...optText(p, "Pesel", "pesel"),
    ...optText(p, "SeriaNumerPaszportu", "passport"),
  }));
  return ok({ payers, result: response.value.result });
}

/** Pobiera dane ubezpieczonego (`pobierzDaneUbezpieczonego`); zwraca surowe dane + wynik. */
export async function getInsuredData(
  session: EzlaSession,
  insured: InsuredId,
  context: AccessContext,
  transport: EzlaTransport,
): Promise<Result<{ data: unknown; result: ZusResult }, P1Error>> {
  const body =
    sessionEl(session) +
    `<Ubezpieczony>${insuredIdEls(insured)}</Ubezpieczony>` +
    `<KontekstDostepu>${context}</KontekstDostepu>`;
  const response = await sendZusRequest("pobierzDaneUbezpieczonego", body, transport);
  if (!response.ok) return response;
  return ok({
    data: findValue(response.value.body, "DaneUbezpieczonego") ?? response.value.body,
    result: response.value.result,
  });
}

/** Pobiera listę zwolnień (ZLA) ubezpieczonego (`pobierzListeZlaUbezpieczonego`). */
export async function getInsuredLeaves(
  session: EzlaSession,
  params: { insured: InsuredId; context: AccessContext; pagination?: Pagination },
  transport: EzlaTransport,
): Promise<Result<{ leaves: readonly unknown[]; result: ZusResult }, P1Error>> {
  const body =
    sessionEl(session) +
    `<Ubezpieczony>${insuredIdEls(params.insured)}</Ubezpieczony>` +
    paginationEl(params.pagination) +
    `<KontekstDostepu>${params.context}</KontekstDostepu>`;
  const response = await sendZusRequest("pobierzListeZlaUbezpieczonego", body, transport);
  if (!response.ok) return response;
  return ok({
    leaves: collect(response.value.body, "ZaswiadczenieLekarskie"),
    result: response.value.result,
  });
}

/** Pobiera treść dokumentu (`pobierzDokument`) - zwraca XML KEDU. */
export async function getDocument(
  session: EzlaSession,
  kind: DocumentKind,
  seriaNumer: SeriaNumerZla,
  context: AccessContext,
  transport: EzlaTransport,
): Promise<Result<{ keduXml?: string; result: ZusResult }, P1Error>> {
  const body =
    sessionEl(session) +
    `<RodzajDokumentu>${kind}</RodzajDokumentu>` +
    seriaNumerEl(seriaNumer) +
    `<KontekstDostepu>${context}</KontekstDostepu>`;
  const response = await sendZusRequest("pobierzDokument", body, transport);
  if (!response.ok) return response;
  const kedu = findValue(response.value.body, "Dokument");
  const keduXml = findText(kedu, "KEDU") ?? (typeof kedu === "string" ? kedu : undefined);
  return ok({ ...(keduXml !== undefined ? { keduXml } : {}), result: response.value.result });
}

/** Sprawdza możliwość anulowania zwolnienia (`sprawdzMozliwoscAnulowania`). */
export async function checkCancellationPossibility(
  session: EzlaSession,
  seriaNumer: SeriaNumerZla,
  transport: EzlaTransport,
): Promise<Result<{ possible: boolean; result: ZusResult }, P1Error>> {
  const body = sessionEl(session) + seriaNumerEl(seriaNumer);
  const response = await sendZusRequest("sprawdzMozliwoscAnulowania", body, transport);
  if (!response.ok) return response;
  const flag =
    findText(response.value.body, "MozliwoscAnulowania") ??
    findText(response.value.body, "Mozliwosc");
  return ok({ possible: flag === "true" || flag === "1", result: response.value.result });
}

/** Pobiera słownik przyczyn anulowania (`pobierzSlownikPrzyczynAnulowania`). */
export async function getCancellationReasons(
  session: EzlaSession,
  transport: EzlaTransport,
  effectiveDate?: string,
): Promise<Result<{ reasons: readonly CancellationReason[]; result: ZusResult }, P1Error>> {
  const body =
    sessionEl(session) +
    (effectiveDate ? `<DataObowiazywania>${effectiveDate}</DataObowiazywania>` : "");
  const response = await sendZusRequest("pobierzSlownikPrzyczynAnulowania", body, transport);
  if (!response.ok) return response;
  const reasons = collect(response.value.body, "PrzyczynaAnulowania").map((r) => ({
    ...optText(r, "Kod", "code"),
    ...optText(r, "Opis", "description"),
  }));
  return ok({ reasons, result: response.value.result });
}

/** Pobiera treść oświadczenia logowania (`pobierzOswiadczenie`) do podpisania. */
export async function getLoginStatement(
  transport: EzlaTransport,
): Promise<Result<string, P1Error>> {
  const response = await sendZusRequest("pobierzOswiadczenie", "", transport);
  if (!response.ok) return response;
  return ok(findText(response.value.body, "Oswiadczenie") ?? "");
}

// --- Pomocniki XML / parsowanie ---------------------------------------------

function sessionEl(session: EzlaSession): string {
  return `<IdSesji>${escapeXml(session.idSesji)}</IdSesji>`;
}

function seriaNumerEl(sn: SeriaNumerZla): string {
  return `<SeriaNumerZla><Seria>${escapeXml(sn.seria)}</Seria><Numer>${escapeXml(sn.numer)}</Numer></SeriaNumerZla>`;
}

function paginationEl(p?: Pagination): string {
  if (!p) return "";
  return `<Stronicowanie><RekordyOd>${p.from}</RekordyOd><LiczbaRekordow>${p.count}</LiczbaRekordow></Stronicowanie>`;
}

function payerIdEls(id: PayerId): string {
  return (
    (id.pesel ? `<Pesel>${escapeXml(id.pesel)}</Pesel>` : "") +
    (id.passport ? `<SeriaNumerPaszportu>${escapeXml(id.passport)}</SeriaNumerPaszportu>` : "") +
    (id.nip ? `<Nip>${escapeXml(id.nip)}</Nip>` : "")
  );
}

function insuredIdEls(id: InsuredId): string {
  return (
    (id.pesel ? `<Pesel>${escapeXml(id.pesel)}</Pesel>` : "") +
    (id.passport ? `<SeriaNumerPaszportu>${escapeXml(id.passport)}</SeriaNumerPaszportu>` : "")
  );
}

function parsePayer(node: unknown): PayerInfo {
  const exists = findText(node, "PlatnikIstnieje");
  const hasPue = findText(node, "MaProfilPue") ?? findText(node, "ProfilPUE");
  return {
    ...(exists !== undefined ? { exists: exists === "true" || exists === "1" } : {}),
    ...optText(node, "Nazwa", "name"),
    ...optText(node, "Imie", "firstName"),
    ...optText(node, "Nazwisko", "lastName"),
    ...(hasPue !== undefined ? { hasPueProfile: hasPue === "true" || hasPue === "1" } : {}),
  };
}

/** Zwraca `{ [outKey]: wartość }` gdy pole `key` istnieje (bezpośrednio w węźle). */
function optText(node: unknown, key: string, outKey: string): Record<string, string> {
  if (node !== null && typeof node === "object" && !Array.isArray(node)) {
    const value = (node as Record<string, unknown>)[key];
    const text = typeof value === "string" ? value : undefined;
    if (text !== undefined) return { [outKey]: text };
  }
  return {};
}

function collect(node: unknown, key: string): unknown[] {
  const out: unknown[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k === key) {
          if (Array.isArray(v)) out.push(...(v as unknown[]));
          else out.push(v);
        } else {
          visit(v);
        }
      }
    }
  };
  visit(node);
  return out;
}
