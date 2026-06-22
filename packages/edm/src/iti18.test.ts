import { generateKeyPairSync } from "node:crypto";
import type { HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import {
  buildFindDocumentsRequest,
  type FindDocumentsInput,
  findDocuments,
  STORED_QUERY,
} from "./iti18.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

const baseInput: FindDocumentsInput = {
  assertionXml: '<saml2:Assertion xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion" ID="_a"/>',
  wsSecurityCertificate: { privateKeyPem, certificateBase64: "ZHVtbXk=" },
  patientId: "40010151673^^^&2.16.840.1.113883.3.4424.1.1.616&ISO",
  now: new Date("2026-01-01T00:00:00Z"),
  idSuffix: "test",
  messageId: "urn:uuid:test-1",
};

describe("buildFindDocumentsRequest", () => {
  it("buduje AdhocQueryRequest (FindDocuments) z pacjentem, statusem i podpisem", () => {
    const xml = buildFindDocumentsRequest(baseInput);
    expect(xml).toContain("<query:AdhocQueryRequest");
    expect(xml).toContain(`id="${STORED_QUERY.FIND_DOCUMENTS}"`);
    expect(xml).toContain('returnType="LeafClass"');
    expect(xml).toContain(
      "<rim:Value>'40010151673^^^&amp;2.16.840.1.113883.3.4424.1.1.616&amp;ISO'</rim:Value>",
    );
    expect(xml).toContain(
      "<rim:Value>('urn:oasis:names:tc:ebxml-regrep:StatusType:Approved')</rim:Value>",
    );
    // asercja + podpis + SOAP 1.2
    expect(xml).toContain('xmlns:soapenv="http://www.w3.org/2003/05/soap-envelope"');
    expect(xml).toContain("<saml2:Assertion");
    expect(xml).toContain("<ds:Signature");
  });

  it("obsługuje wiele statusów i returnType ObjectRef", () => {
    const xml = buildFindDocumentsRequest({
      ...baseInput,
      statuses: ["Approved", "Deprecated"],
      returnType: "ObjectRef",
    });
    expect(xml).toContain('returnType="ObjectRef"');
    expect(xml).toContain(
      "('urn:oasis:names:tc:ebxml-regrep:StatusType:Approved'," +
        "'urn:oasis:names:tc:ebxml-regrep:StatusType:Deprecated')",
    );
  });
});

const leafResponse =
  `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>` +
  `<query:AdhocQueryResponse xmlns:query="urn:oasis:names:tc:ebxml-regrep:xsd:query:3.0"` +
  ` status="urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Success">` +
  `<rim:RegistryObjectList xmlns:rim="urn:oasis:names:tc:ebxml-regrep:xsd:rim:3.0">` +
  `<rim:ExtrinsicObject id="urn:uuid:doc-1" status="urn:oasis:names:tc:ebxml-regrep:StatusType:Approved">` +
  `<rim:Slot name="repositoryUniqueId"><rim:ValueList><rim:Value>2.16.840.1.113883.3.4424.2.7.1491.24.1</rim:Value></rim:ValueList></rim:Slot>` +
  `<rim:Slot name="urn:extpl:SlotName:MedicalEventId"><rim:ValueList><rim:Value>EVT-1^^^&amp;OID&amp;ISO</rim:Value></rim:ValueList></rim:Slot>` +
  `<rim:ExternalIdentifier identificationScheme="urn:uuid:2e82c1f6-a085-4c72-9da3-8640a32e42ab" value="2.16.840.1.113883.3.4424.2.7.1491^DOC1"/>` +
  `</rim:ExtrinsicObject>` +
  `</rim:RegistryObjectList></query:AdhocQueryResponse></soap:Body></soap:Envelope>`;

const objectRefResponse =
  `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>` +
  `<query:AdhocQueryResponse xmlns:query="urn:oasis:names:tc:ebxml-regrep:xsd:query:3.0"` +
  ` status="urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Success">` +
  `<rim:RegistryObjectList xmlns:rim="urn:oasis:names:tc:ebxml-regrep:xsd:rim:3.0">` +
  `<rim:ObjectRef id="urn:uuid:doc-9"/>` +
  `</rim:RegistryObjectList></query:AdhocQueryResponse></soap:Body></soap:Envelope>`;

const failureResponse =
  `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>` +
  `<query:AdhocQueryResponse xmlns:query="urn:oasis:names:tc:ebxml-regrep:xsd:query:3.0"` +
  ` status="urn:oasis:names:tc:ebxml-regrep:ResponseStatusType:Failure">` +
  `<rs:RegistryErrorList xmlns:rs="urn:oasis:names:tc:ebxml-regrep:xsd:rs:3.0">` +
  `<rs:RegistryError errorCode="XDSRegistryError" codeContext="minor: Timeout"/>` +
  `</rs:RegistryErrorList></query:AdhocQueryResponse></soap:Body></soap:Envelope>`;

describe("findDocuments", () => {
  it("parsuje LeafClass (uniqueId, repozytorium, zdarzenie)", async () => {
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (req) => {
        captured = req;
        return Promise.resolve({ status: 200, headers: {}, body: leafResponse });
      },
    };
    const result = await findDocuments(baseInput, client);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
      const doc = result.value.documents[0];
      expect(doc?.entryUuid).toBe("urn:uuid:doc-1");
      expect(doc?.uniqueId).toBe("2.16.840.1.113883.3.4424.2.7.1491^DOC1");
      expect(doc?.repositoryUniqueId).toBe("2.16.840.1.113883.3.4424.2.7.1491.24.1");
      expect(doc?.medicalEventId).toContain("EVT-1");
    }
    expect(captured?.headers["Content-Type"]).toContain("RegistryStoredQuery");
  });

  it("parsuje ObjectRef (same referencje)", async () => {
    const client: HttpClient = {
      send: () => Promise.resolve({ status: 200, headers: {}, body: objectRefResponse }),
    };
    const result = await findDocuments(baseInput, client);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.documents).toHaveLength(1);
      expect(result.value.documents[0]?.entryUuid).toBe("urn:uuid:doc-9");
    }
  });

  it("zwraca Failure bez wyników", async () => {
    const client: HttpClient = {
      send: () => Promise.resolve({ status: 200, headers: {}, body: failureResponse }),
    };
    const result = await findDocuments(baseInput, client);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(false);
      expect(result.value.documents).toHaveLength(0);
    }
  });

  it("mapuje błąd sieci na błąd transportu", async () => {
    const client: HttpClient = { send: () => Promise.reject(new Error("ECONNREFUSED")) };
    const result = await findDocuments(baseInput, client);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("transport");
  });
});
