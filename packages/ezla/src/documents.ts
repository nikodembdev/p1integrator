import { ok, type P1Error, type Result } from "@p1/core";
import type {
  DocumentKind,
  EzlaSession,
  EzlaTransport,
  IssueMode,
  SeriaNumerZla,
  ValidationError,
  ValidationResult,
  ZusResult,
} from "./types.js";
import { findText, findValue, sendZusRequest, type ZusResponse, zusResult } from "./transport.js";
import { escapeXml } from "./xml.js";

/** Podpisany dokument KED ZLA (XML z `ds:Signature`) gotowy do wysyłki. */
export type SignedKeduDocument = string;

/** Wynik wysyłki dokumentów (`wyslijDokumenty`). */
export interface SendResult {
  readonly result: ZusResult;
  readonly validation?: ValidationResult;
  /** Wyniki wysyłki poszczególnych dokumentów (`RezultatWysylki`). */
  readonly sendResults: readonly ZusResult[];
}

/**
 * Waliduje dokumenty KED ZLA bez wysyłki (`walidujDokumenty`): sesja + tryb +
 * podpisane dokumenty → wynik walidacji (lista błędów).
 */
export async function walidujDokumenty(
  session: EzlaSession,
  mode: IssueMode,
  documents: readonly SignedKeduDocument[],
  transport: EzlaTransport,
): Promise<Result<ValidationResult, P1Error>> {
  const body =
    `<IdSesji>${escapeXml(session.idSesji)}</IdSesji>` +
    `<Tryb>${mode}</Tryb>` +
    documents.map(dokumentElement).join("");

  const response = await sendZusRequest("walidujDokumenty", body, transport);
  if (!response.ok) return response;
  return ok(extractValidation(response.value.body));
}

/**
 * Wysyła dokumenty KED ZLA (`wyslijDokumenty`): sesja + tryb + podpisane dokumenty
 * → wynik operacji + wynik walidacji + wyniki wysyłki poszczególnych dokumentów.
 */
export async function wyslijDokumenty(
  session: EzlaSession,
  mode: IssueMode,
  documents: readonly SignedKeduDocument[],
  transport: EzlaTransport,
): Promise<Result<SendResult, P1Error>> {
  const body =
    `<IdSesji>${escapeXml(session.idSesji)}</IdSesji>` +
    `<Tryb>${mode}</Tryb>` +
    documents.map(dokumentElement).join("");

  const response = await sendZusRequest("wyslijDokumenty", body, transport);
  if (!response.ok) return response;

  const validation = extractValidation(response.value.body);
  return ok({
    result: response.value.result,
    ...(validation.result !== undefined || validation.errors.length > 0 ? { validation } : {}),
    sendResults: extractSendResults(response.value.body),
  });
}

/**
 * Pobiera UPP (Urzędowe Poświadczenie Przedłożenia) dla wysłanego dokumentu
 * (`pobierzUppDlaDokumentu`) - dowód przyjęcia dokumentu przez ZUS.
 */
export async function pobierzUppDlaDokumentu(
  session: EzlaSession,
  kind: DocumentKind,
  seriaNumer: SeriaNumerZla,
  transport: EzlaTransport,
): Promise<Result<{ upp?: string; result: ZusResult }, P1Error>> {
  const body =
    `<IdSesji>${escapeXml(session.idSesji)}</IdSesji>` +
    `<RodzajDokumentu>${kind}</RodzajDokumentu>` +
    `<SeriaNumerZla><Seria>${escapeXml(seriaNumer.seria)}</Seria>` +
    `<Numer>${escapeXml(seriaNumer.numer)}</Numer></SeriaNumerZla>`;

  const response = await sendZusRequest("pobierzUppDlaDokumentu", body, transport);
  if (!response.ok) return response;
  const upp = findText(response.value.body, "Upp") ?? findText(response.value.body, "TrescUpp");
  return ok({ ...(upp !== undefined ? { upp } : {}), result: response.value.result });
}

/**
 * Nadaje serię i numer parom dokumentów (`nadajSeriaNumerZla`). Każda para to
 * oryginał (+ opcjonalna kopia) podpisanego KED ZLA; ZUS zwraca przydzielone
 * serie/numery. SKELETON - mapowanie zwróconych par do uzupełnienia.
 */
export async function nadajSeriaNumerZla(
  session: EzlaSession,
  pairs: readonly { oryginal: SignedKeduDocument; kopia?: SignedKeduDocument }[],
  transport: EzlaTransport,
): Promise<Result<ZusResponse, P1Error>> {
  const body =
    `<IdSesji>${escapeXml(session.idSesji)}</IdSesji>` +
    pairs
      .map(
        (pair, i) =>
          `<ParaDokumentow NrRef="${i + 1}">` +
          `<Oryginal>${keduWrapper(pair.oryginal)}</Oryginal>` +
          (pair.kopia ? `<Kopia>${keduWrapper(pair.kopia)}</Kopia>` : "") +
          `</ParaDokumentow>`,
      )
      .join("");

  return sendZusRequest("nadajSeriaNumerZla", body, transport);
}

/** Element `<Dokument><KEDU>{podpisany KEDU}</KEDU></Dokument>`. */
function dokumentElement(signedKedu: SignedKeduDocument): string {
  return `<Dokument>${keduWrapper(signedKedu)}</Dokument>`;
}

/** Owija podpisany dokument KEDU w element `<KEDU>` (bez deklaracji XML). */
function keduWrapper(signedKedu: SignedKeduDocument): string {
  return `<KEDU>${stripXmlDeclaration(signedKedu)}</KEDU>`;
}

function stripXmlDeclaration(xml: string): string {
  return xml.replace(/^\s*<\?xml[^?]*\?>\s*/i, "");
}

/** Wyciąga wynik walidacji (`RezultatWalidacji`) z odpowiedzi. */
function extractValidation(body: unknown): ValidationResult {
  const node = findValue(body, "RezultatWalidacji");
  const result = findText(node, "Rezultat");
  const errors: ValidationError[] = collect(node, "BladWalidacji").map((e) => {
    const code = findText(e, "KodBledu");
    const message = findText(e, "OpisBledu");
    const location = findText(e, "Miejsce");
    return {
      ...(code !== undefined ? { code } : {}),
      ...(message !== undefined ? { message } : {}),
      ...(location !== undefined ? { location } : {}),
    };
  });
  return { ...(result !== undefined ? { result } : {}), errors };
}

/** Wyciąga wyniki wysyłki poszczególnych dokumentów (`RezultatWysylki`). */
function extractSendResults(body: unknown): ZusResult[] {
  return collect(body, "RezultatWysylki").map((r) => zusResult(r));
}

/** Zbiera węzły o danym kluczu lokalnym (płaska lista). */
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
