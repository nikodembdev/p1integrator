import { generateKeyPairSync } from "node:crypto";
import type { HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import type { DocumentIndexInput } from "./ebrim.js";
import {
  buildRegisterDocumentSetRequest,
  registerDocumentSet,
  type RegisterDocumentSetInput,
} from "./iti42.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

const index: DocumentIndexInput = {
  submissionSet: {
    submissionUuid: "urn:uuid:11111111-0000-0000-0000-000000000001",
    uniqueId: { root: "2.16.840.1.113883.3.4424.2.7.1491.20", extension: "SS1" },
    sourceId: "2.16.840.1.113883.3.4424.2.7.1491",
    submissionTime: "20260621120000",
    author: { person: { familyName: "Leczniczy", givenName: "Adam713" } },
    patientId: "40010151673^^^&2.16.840.1.113883.3.4424.1.1.616&ISO",
  },
  document: {
    entryUuid: "urn:uuid:22222222-0000-0000-0000-000000000002",
    uniqueId: { root: "2.16.840.1.113883.3.4424.2.7.1491.21", extension: "DOC1" },
    repositoryUniqueId: "2.16.840.1.113883.3.4424.2.7.1491.24.1",
    mimeType: "text/xml",
    hash: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
    size: 4096,
    creationTime: "20260621120000",
    medicalEvent: { id: "316544979021366272", oid: "2.16.840.1.113883.3.4424.2.7.1491.15.1" },
    sourcePatient: {
      id: "40010151673",
      oid: "2.16.840.1.113883.3.4424.2.7.1491.17.1",
      info: { familyName: "Seniorka", givenName: "Sylwia" },
    },
    author: { person: { familyName: "Leczniczy", givenName: "Adam713" } },
    typeP1: { code: "06.10", codingScheme: "P1", displayName: "Karta" },
    typeLoinc: { code: "34105-7", codingScheme: "LOINC", displayName: "Discharge" },
    confidentiality: { code: "N", codingScheme: "2.16.840.1.113883.5.25", displayName: "normal" },
    format: { code: "urn:extPL:pl-cda", codingScheme: "P1", displayName: "PIK HL7 CDA" },
    patientId: "40010151673^^^&2.16.840.1.113883.3.4424.1.1.616&ISO",
  },
};

const baseInput: RegisterDocumentSetInput = {
  index,
  assertionXml: '<saml2:Assertion xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion" ID="_a"/>',
  wsSecurityCertificate: { privateKeyPem, certificateBase64: "ZHVtbXk=" },
  now: new Date("2026-01-01T00:00:00Z"),
  idSuffix: "test",
  messageId: "urn:uuid:test-1",
};

describe("buildRegisterDocumentSetRequest", () => {
  it("buduje SOAP 1.2 z SubmitObjectsRequest, asercją i podpisem", () => {
    const xml = buildRegisterDocumentSetRequest(baseInput);
    expect(xml).toContain('xmlns:soapenv="http://www.w3.org/2003/05/soap-envelope"');
    expect(xml).toContain("<lcm:SubmitObjectsRequest>");
    expect(xml).toContain("<rim:RegistryObjectList");
    expect(xml).toContain("urn:ihe:iti:2007:RegisterDocumentSet-b");
    // asercja osadzona w nagłówku WS-Security
    expect(xml).toContain("<wsse:BinarySecurityToken");
    expect(xml).toContain("<saml2:Assertion");
    expect(xml).toContain("<ds:Signature");
    // link do zdarzenia medycznego
    expect(xml).toContain("urn:extpl:SlotName:MedicalEventId");
  });
});

const successResponse =
  `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>` +
  `<rs:RegistryResponse xmlns:rs="urn:oasis:names:tc:ebxml-regrep:xsd:rs:3.0"` +
  ` status="urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Success"/>` +
  `</soap:Body></soap:Envelope>`;

const failureResponse =
  `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>` +
  `<rs:RegistryResponse xmlns:rs="urn:oasis:names:tc:ebxml-regrep:xsd:rs:3.0"` +
  ` status="urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Failure">` +
  `<rs:RegistryErrorList><rs:RegistryError errorCode="XDSRegistryMetadataError"` +
  ` codeContext="rule: REG.WER.6860" severity="urn:oasis:names:tc:ebxml-regrep:ErrorSeverityType:Error"/>` +
  `</rs:RegistryErrorList></rs:RegistryResponse></soap:Body></soap:Envelope>`;

describe("registerDocumentSet", () => {
  it("zwraca success przy statusie Success", async () => {
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (req) => {
        captured = req;
        return Promise.resolve({ status: 200, headers: {}, body: successResponse });
      },
    };
    const result = await registerDocumentSet(baseInput, client);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
      expect(result.value.errors).toHaveLength(0);
    }
    expect(captured?.headers["Content-Type"]).toContain("application/soap+xml");
    expect(captured?.headers["Content-Type"]).toContain("RegisterDocumentSet-b");
  });

  it("parsuje RegistryErrorList przy Failure", async () => {
    const client: HttpClient = {
      send: () => Promise.resolve({ status: 200, headers: {}, body: failureResponse }),
    };
    const result = await registerDocumentSet(baseInput, client);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(false);
      expect(result.value.errors[0]?.errorCode).toBe("XDSRegistryMetadataError");
      expect(result.value.errors[0]?.codeContext).toContain("REG.WER.6860");
    }
  });

  it("mapuje błąd sieci na błąd transportu", async () => {
    const client: HttpClient = { send: () => Promise.reject(new Error("ECONNREFUSED")) };
    const result = await registerDocumentSet(baseInput, client);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("transport");
  });
});
