import { generateKeyPairSync } from "node:crypto";
import type { HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import type { SubmissionSetInput } from "./ebrim.js";
import {
  buildUpdateDocumentStatusRequest,
  type UpdateDocumentStatusInput,
  updateDocumentStatus,
} from "./iti57.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

const submissionSet: SubmissionSetInput = {
  submissionUuid: "urn:uuid:55555555-0000-0000-0000-000000000005",
  uniqueId: { root: "2.16.840.1.113883.3.4424.2.7.1491.20", extension: "SS-UPD" },
  sourceId: "2.16.840.1.113883.3.4424.2.7.1491",
  submissionTime: "20260622120000",
  author: { person: { familyName: "Leczniczy", givenName: "Adam713" } },
  patientId: "40010151673^^^&2.16.840.1.113883.3.4424.1.1.616&ISO",
};

const baseInput: UpdateDocumentStatusInput = {
  assertionXml: '<saml2:Assertion xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion" ID="_a"/>',
  wsSecurityCertificate: { privateKeyPem, certificateBase64: "ZHVtbXk=" },
  submissionSet,
  targetEntryUuid: "urn:uuid:23f6e7b3-0000-0000-0000-4ca4f7fb1ef8",
  now: new Date("2026-01-01T00:00:00Z"),
  idSuffix: "test",
  messageId: "urn:uuid:test-1",
};

describe("buildUpdateDocumentStatusRequest", () => {
  it("buduje UpdateAvailabilityStatus (Approved -> Deprecated) z SubmissionSet i podpisem", () => {
    const xml = buildUpdateDocumentStatusRequest(baseInput);
    expect(xml).toContain("<lcm:SubmitObjectsRequest>");
    expect(xml).toContain("<rim:RegistryPackage"); // nowy SubmissionSet
    expect(xml).toContain(
      'associationType="urn:ihe:iti:2010:AssociationType:UpdateAvailabilityStatus"',
    );
    expect(xml).toContain('targetObject="urn:uuid:23f6e7b3-0000-0000-0000-4ca4f7fb1ef8"');
    expect(xml).toContain('sourceObject="urn:uuid:55555555-0000-0000-0000-000000000005"');
    expect(xml).toContain(
      '<rim:Slot name="OriginalStatus"><rim:ValueList><rim:Value>' +
        "urn:oasis:names:tc:ebxml-regrep:StatusType:Approved",
    );
    expect(xml).toContain(
      '<rim:Slot name="NewStatus"><rim:ValueList><rim:Value>' +
        "urn:oasis:names:tc:ebxml-regrep:StatusType:Deprecated",
    );
    expect(xml).toContain("<saml2:Assertion");
    expect(xml).toContain("<ds:Signature");
  });

  it("pozwala odwrócić zmianę (Deprecated -> Approved)", () => {
    const xml = buildUpdateDocumentStatusRequest({
      ...baseInput,
      originalStatus: "Deprecated",
      newStatus: "Approved",
    });
    expect(xml).toContain(
      'OriginalStatus"><rim:ValueList><rim:Value>urn:oasis:names:tc:ebxml-regrep:StatusType:Deprecated',
    );
    expect(xml).toContain(
      'NewStatus"><rim:ValueList><rim:Value>urn:oasis:names:tc:ebxml-regrep:StatusType:Approved',
    );
  });
});

const successResponse =
  `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>` +
  `<rs:RegistryResponse xmlns:rs="urn:oasis:names:tc:ebxml-regrep:xsd:rs:3.0"` +
  ` status="urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Success"/>` +
  `</soap:Body></soap:Envelope>`;

describe("updateDocumentStatus", () => {
  it("zwraca success i ustawia SOAPAction UpdateDocumentSet", async () => {
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (req) => {
        captured = req;
        return Promise.resolve({ status: 200, headers: {}, body: successResponse });
      },
    };
    const result = await updateDocumentStatus(baseInput, client);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(true);
    expect(captured?.headers["Content-Type"]).toContain("urn:ihe:iti:2010:UpdateDocumentSet");
  });

  it("mapuje błąd sieci na błąd transportu", async () => {
    const client: HttpClient = { send: () => Promise.reject(new Error("ECONNREFUSED")) };
    const result = await updateDocumentStatus(baseInput, client);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("transport");
  });
});
