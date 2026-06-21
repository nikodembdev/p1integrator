import { generateKeyPairSync } from "node:crypto";
import type { HttpClient } from "@p1/core";
import { describe, expect, it } from "vitest";
import { type DocumentStore, documentMetadata } from "./document-store.js";
import {
  buildRetrieveDocumentSetRequest,
  parseDocumentResponses,
  type RetrieveDocumentSetInput,
  retrieveDocumentSet,
} from "./iti43.js";
import { handleRetrieveDocumentSet } from "./repository.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

/** Proste repozytorium w pamięci spełniające port DocumentStore. */
function memoryStore(): DocumentStore & { seed(id: string, content: Buffer, mime: string): void } {
  const repo = "2.16.840.1.113883.3.4424.2.7.1491.24.1";
  const data = new Map<string, { content: Buffer; mimeType: string }>();
  return {
    seed(id, content, mimeType) {
      data.set(id, { content, mimeType });
    },
    put(input) {
      const meta = documentMetadata(input.content, input.mimeType, input.uniqueId ?? "X");
      data.set(meta.uniqueId, { content: input.content, mimeType: input.mimeType });
      return Promise.resolve(meta);
    },
    get(ref) {
      if (ref.repositoryUniqueId !== repo) return Promise.resolve(undefined);
      return Promise.resolve(data.get(ref.documentUniqueId));
    },
  };
}

const cda = Buffer.from("<ClinicalDocument><id/></ClinicalDocument>", "utf8");
const repo = "2.16.840.1.113883.3.4424.2.7.1491.24.1";

const baseInput: RetrieveDocumentSetInput = {
  assertionXml: '<saml2:Assertion xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion" ID="_a"/>',
  wsSecurityCertificate: { privateKeyPem, certificateBase64: "ZHVtbXk=" },
  documents: [{ repositoryUniqueId: repo, documentUniqueId: "DOC-1" }],
  now: new Date("2026-01-01T00:00:00Z"),
  idSuffix: "test",
  messageId: "urn:uuid:test-1",
};

describe("buildRetrieveDocumentSetRequest", () => {
  it("buduje RetrieveDocumentSetRequest z asercją i podpisem", () => {
    const xml = buildRetrieveDocumentSetRequest(baseInput);
    expect(xml).toContain("<xdsb:RetrieveDocumentSetRequest");
    expect(xml).toContain("<xdsb:RepositoryUniqueId>2.16.840.1.113883.3.4424.2.7.1491.24.1");
    expect(xml).toContain("<xdsb:DocumentUniqueId>DOC-1</xdsb:DocumentUniqueId>");
    expect(xml).toContain("<saml2:Assertion");
    expect(xml).toContain("<ds:Signature");
  });
});

describe("repozytorium round-trip (klient ITI-43 <-> handler na DocumentStore)", () => {
  it("oddaje zapisaną treść (Success)", async () => {
    const store = memoryStore();
    store.seed("DOC-1", cda, "text/xml");

    // Serwer repo: handler buduje odpowiedź z treści ze store'a.
    const client: HttpClient = {
      send: async (req) => {
        const result = await handleRetrieveDocumentSet(req.body ?? "", store);
        return { status: 200, headers: {}, body: result.soap };
      },
    };

    const result = await retrieveDocumentSet(baseInput, client);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
      expect(result.value.documents).toHaveLength(1);
      expect(result.value.documents[0]?.mimeType).toBe("text/xml");
      expect(result.value.documents[0]?.content.toString("utf8")).toBe(cda.toString("utf8"));
    }
  });

  it("zwraca Failure dla brakującego dokumentu", async () => {
    const store = memoryStore(); // pusty
    const out = await handleRetrieveDocumentSet(
      `<xdsb:RetrieveDocumentSetRequest xmlns:xdsb="urn:ihe:iti:xds-b:2007">` +
        `<xdsb:DocumentRequest><xdsb:RepositoryUniqueId>${repo}</xdsb:RepositoryUniqueId>` +
        `<xdsb:DocumentUniqueId>NIEMA</xdsb:DocumentUniqueId></xdsb:DocumentRequest>` +
        `</xdsb:RetrieveDocumentSetRequest>`,
      store,
    );
    expect(out.status).toContain("Failure");
    expect(out.missing).toEqual(["NIEMA"]);
    expect(out.soap).toContain("XDSDocumentUniqueIdError");
  });

  it("PartialSuccess gdy część znaleziona", async () => {
    const store = memoryStore();
    store.seed("DOC-1", cda, "text/xml");
    const out = await handleRetrieveDocumentSet(
      `<xdsb:RetrieveDocumentSetRequest xmlns:xdsb="urn:ihe:iti:xds-b:2007">` +
        `<xdsb:DocumentRequest><xdsb:RepositoryUniqueId>${repo}</xdsb:RepositoryUniqueId>` +
        `<xdsb:DocumentUniqueId>DOC-1</xdsb:DocumentUniqueId></xdsb:DocumentRequest>` +
        `<xdsb:DocumentRequest><xdsb:RepositoryUniqueId>${repo}</xdsb:RepositoryUniqueId>` +
        `<xdsb:DocumentUniqueId>NIEMA</xdsb:DocumentUniqueId></xdsb:DocumentRequest>` +
        `</xdsb:RetrieveDocumentSetRequest>`,
      store,
    );
    expect(out.status).toContain("PartialSuccess");
    expect(out.returned).toBe(1);
    expect(parseDocumentResponses(out.soap)).toHaveLength(1);
  });
});
