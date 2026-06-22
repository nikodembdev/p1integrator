import { connect as tlsConnect } from "node:tls";

/**
 * ITI-20 (Record Audit Event, ATNA) - przekazanie zdarzenia audytu do P1.
 * Komunikat: AuditMessage (DICOM/IHE) opakowany w syslog RFC 5424, ramkowany wg
 * RFC 5425 (`<długość> <komunikat>`), wysyłany przez TLS z dwustronnym
 * uwierzytelnieniem (port 6514). Repozytorium loguje m.in. każde wydanie dokumentu (ITI-43).
 */

/** Domyślny host:port usługi audytu ATNA (środowisko integracyjne). */
export const DEFAULT_ATNA_HOST = "isus.ezdrowie.gov.pl";
export const DEFAULT_ATNA_PORT = 6514;

/** Wynik operacji audytu (np. EventOutcomeIndicator). */
export type AuditOutcome = "0" | "4" | "8" | "12"; // sukces / drobny / poważny / krytyczny

export interface RetrieveAuditInput {
  /** Czas zdarzenia (domyślnie teraz). */
  readonly eventDateTime?: Date;
  /** Wynik (domyślnie 0 - sukces). */
  readonly outcome?: AuditOutcome;
  /** URL usługi repozytorium (ActiveParticipant Source UserID). */
  readonly repositoryServiceUrl: string;
  /** Identyfikator podmiotu-repozytorium (Source AlternativeUserID), np. CX `id^^^&OID&ISO`. */
  readonly repositorySubjectId: string;
  /** Identyfikator repozytorium (OID) - ParticipantObjectDetail "Repository Unique Id". */
  readonly repositoryUniqueId: string;
  /** uniqueId pobranego dokumentu (ParticipantObjectID). */
  readonly documentUniqueId: string;
  /** Identyfikator strony żądającej (Destination AlternativeUserID), np. CX podmiotu. */
  readonly requestingSubjectId?: string;
  /** AuditSourceID (zwykle CX podmiotu-repozytorium). */
  readonly auditSourceId: string;
}

const escapeXml = (v: string): string =>
  v.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);

/**
 * Buduje AuditMessage dla wydania dokumentu przez repozytorium (ITI-43 Export).
 * Odwzorowuje strukturę audytu repozytorium z przykładów P1.
 */
export function buildRetrieveAuditMessage(input: RetrieveAuditInput): string {
  const when = (input.eventDateTime ?? new Date()).toISOString();
  const outcome = input.outcome ?? "0";
  const destination = input.requestingSubjectId
    ? `<ActiveParticipant UserID="http://www.w3.org/2005/08/addressing/anonymous"` +
      ` AlternativeUserID="${escapeXml(input.requestingSubjectId)}" UserIsRequestor="true"` +
      ` NetworkAccessPointID="localhost" NetworkAccessPointTypeCode="1">` +
      `<RoleIDCode csd-code="110152" codeSystemName="DCM" originalText="Destination"/>` +
      `</ActiveParticipant>`
    : "";

  return (
    `<AuditMessage>` +
    `<EventIdentification EventActionCode="R" EventDateTime="${when}" EventOutcomeIndicator="${outcome}">` +
    `<EventID csd-code="110106" codeSystemName="DCM" originalText="Export"/>` +
    `<EventTypeCode csd-code="ITI-43" codeSystemName="IHE Transactions" originalText="Retrieve Document Set"/>` +
    `</EventIdentification>` +
    `<ActiveParticipant UserID="${escapeXml(input.repositoryServiceUrl)}"` +
    ` AlternativeUserID="${escapeXml(input.repositorySubjectId)}" UserIsRequestor="false"` +
    ` NetworkAccessPointID="127.0.0.1" NetworkAccessPointTypeCode="2">` +
    `<RoleIDCode csd-code="110153" codeSystemName="DCM" originalText="Source"/>` +
    `</ActiveParticipant>` +
    destination +
    `<AuditSourceIdentification AuditSourceID="${escapeXml(input.auditSourceId)}">` +
    `<AuditSourceTypeCode csd-code="4" codeSystemName="DCM" originalText="Application Server Process or Thread"/>` +
    `</AuditSourceIdentification>` +
    `<ParticipantObjectIdentification ParticipantObjectID="${escapeXml(input.documentUniqueId)}"` +
    ` ParticipantObjectTypeCode="2" ParticipantObjectTypeCodeRole="3">` +
    `<ParticipantObjectIDTypeCode csd-code="9" codeSystemName="RFC-3881" originalText="Report Number"/>` +
    `<ParticipantObjectDetail type="Repository Unique Id"` +
    ` value="${Buffer.from(input.repositoryUniqueId, "utf8").toString("base64")}"/>` +
    `</ParticipantObjectIdentification>` +
    `</AuditMessage>`
  );
}

export interface SyslogOptions {
  /** Facility (domyślnie 10 - security/authorization). */
  readonly facility?: number;
  /** Severity (domyślnie 5 - Notice). */
  readonly severity?: number;
  readonly hostname?: string;
  readonly appName?: string;
  readonly procId?: string;
  readonly messageId?: string;
  readonly timestamp?: Date;
}

/** Buduje komunikat syslog RFC 5424 (`<PRI>1 TS HOST APP PROCID MSGID - MSG`). */
export function buildSyslogMessage(message: string, opts: SyslogOptions = {}): string {
  const pri = (opts.facility ?? 10) * 8 + (opts.severity ?? 5);
  const ts = (opts.timestamp ?? new Date()).toISOString();
  const host = opts.hostname ?? "-";
  const app = opts.appName ?? "EDM";
  const procId = opts.procId ?? "-";
  const msgId = opts.messageId ?? "-";
  // BOM przed MSG sygnalizuje UTF-8 (RFC 5424).
  return `<${pri}>1 ${ts} ${host} ${app} ${procId} ${msgId} - \uFEFF${message}`;
}

/** Ramkowanie RFC 5425 (octet-counting): `<liczba-oktetów> <komunikat>`. */
export function frameRfc5425(syslogMessage: string): Buffer {
  const payload = Buffer.from(syslogMessage, "utf8");
  return Buffer.concat([Buffer.from(`${payload.length} `, "ascii"), payload]);
}

export interface AtnaSendOptions {
  readonly host?: string;
  readonly port?: number;
  /** Klucz prywatny TLS (PEM) - mutual TLS. */
  readonly tlsKey: string;
  /** Certyfikat TLS (PEM). */
  readonly tlsCert: string;
  readonly rejectUnauthorized?: boolean;
  readonly timeoutMs?: number;
  readonly syslog?: SyslogOptions;
}

/**
 * Wysyła AuditMessage do P1 (ITI-20) przez TLS (syslog RFC 5425). Zwraca surową
 * odpowiedź serwera (jeśli jest). Połączenie z dwustronnym uwierzytelnieniem.
 */
export function sendAuditEvent(auditMessageXml: string, options: AtnaSendOptions): Promise<string> {
  const host = options.host ?? DEFAULT_ATNA_HOST;
  const port = options.port ?? DEFAULT_ATNA_PORT;
  const frame = frameRfc5425(buildSyslogMessage(auditMessageXml, options.syslog));

  return new Promise<string>((resolve, reject) => {
    const socket = tlsConnect(
      {
        host,
        port,
        key: options.tlsKey,
        cert: options.tlsCert,
        rejectUnauthorized: options.rejectUnauthorized ?? true,
      },
      () => {
        socket.write(frame);
      },
    );
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      socket.destroy();
      // Brak odpowiedzi w oknie czasu = uznajemy za wysłane (ATNA bywa fire-and-forget).
      resolve(Buffer.concat(chunks).toString("utf8"));
    }, options.timeoutMs ?? 5000);

    socket.on("data", (d: Buffer) => chunks.push(d));
    socket.on("end", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    socket.on("error", (e: Error) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}
