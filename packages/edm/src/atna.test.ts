import { describe, expect, it } from "vitest";
import { buildRetrieveAuditMessage, buildSyslogMessage, frameRfc5425 } from "./atna.js";

describe("buildRetrieveAuditMessage", () => {
  const audit = buildRetrieveAuditMessage({
    eventDateTime: new Date("2026-06-22T10:00:00Z"),
    repositoryServiceUrl: "https://repo.example/services/iti43",
    repositorySubjectId: "000000927722^^^&2.16.840.1.113883.3.4424.2.3.1&ISO",
    repositoryUniqueId: "2.16.840.1.113883.3.4424.7.24.144182",
    documentUniqueId: "2.16.840.1.113883.3.4424.2.7.1491^DOC1",
    requestingSubjectId: "000000786129^^^&2.16.840.1.113883.3.4424.2.3.1&ISO",
    auditSourceId: "000000927722^^^&2.16.840.1.113883.3.4424.2.3.1&ISO",
  });

  it("buduje AuditMessage Export (ITI-43) z uczestnikami i obiektem", () => {
    expect(audit).toContain("<AuditMessage>");
    expect(audit).toContain('EventActionCode="R"');
    expect(audit).toContain('csd-code="110106"'); // Export
    expect(audit).toContain('originalText="Retrieve Document Set"');
    expect(audit).toContain('csd-code="110153"'); // Source
    expect(audit).toContain('csd-code="110152"'); // Destination
    expect(audit).toContain('ParticipantObjectID="2.16.840.1.113883.3.4424.2.7.1491^DOC1"');
    // repozytorium w detalu jako base64
    expect(audit).toContain(
      `value="${Buffer.from("2.16.840.1.113883.3.4424.7.24.144182", "utf8").toString("base64")}"`,
    );
  });
});

describe("buildSyslogMessage / frameRfc5425", () => {
  it("buduje RFC 5424 z PRI i wersją oraz ramkuje wg RFC 5425", () => {
    const syslog = buildSyslogMessage("<AuditMessage/>", {
      timestamp: new Date("2026-06-22T10:00:00Z"),
      hostname: "host1",
      appName: "EDM",
      messageId: "AUDIT",
    });
    // PRI = facility 10 * 8 + severity 5 = 85, VERSION 1
    expect(syslog.startsWith("<85>1 2026-06-22T10:00:00.000Z host1 EDM - AUDIT - ")).toBe(true);
    expect(syslog).toContain("<AuditMessage/>");

    const frame = frameRfc5425(syslog);
    const payloadLen = Buffer.from(syslog, "utf8").length;
    expect(frame.toString("utf8").startsWith(`${payloadLen} `)).toBe(true);
    expect(frame.length).toBe(`${payloadLen} `.length + payloadLen);
  });
});
