// EDM: jak zbudować własne repozytorium XDS.b przy pomocy libki. Przechowywanie
// treści robisz sam (port DocumentStore); biblioteka daje handler protokołu ITI-43
// (handleRetrieveDocumentSet), który wpinasz we własny serwer HTTP. Ten przykład
// działa offline (bez P1) - pokazuje implementację store'a i round-trip żądania.
// pnpm tsx examples/13-edm-serwer-repozytorium.ts
import {
  buildRetrieveDocumentSetBody,
  type DocumentStore,
  documentMetadata,
  handleRetrieveDocumentSet,
  parseDocumentResponses,
} from "@p1/edm";

const REPO_ID = "2.16.840.1.113883.3.4424.7.24.144182"; // identyfikator repo z SZAR

// 1) Implementacja portu DocumentStore - tu w pamięci; u siebie: dysk/S3/baza.
function createMemoryStore(): DocumentStore {
  const data = new Map<string, { content: Buffer; mimeType: string }>();
  return {
    put(input) {
      const uniqueId = input.uniqueId ?? `${REPO_ID}.${data.size + 1}`;
      const meta = documentMetadata(input.content, input.mimeType, uniqueId);
      data.set(uniqueId, { content: input.content, mimeType: input.mimeType });
      return Promise.resolve(meta);
    },
    get(ref) {
      if (ref.repositoryUniqueId !== REPO_ID) return Promise.resolve(undefined);
      return Promise.resolve(data.get(ref.documentUniqueId));
    },
  };
}

const store = createMemoryStore();

// 2) Zapis dokumentu w repozytorium - metadane (hash, rozmiar) idą potem do indeksu (ITI-42).
const cda = Buffer.from("<ClinicalDocument><id/></ClinicalDocument>", "utf8");
const meta = await store.put({ uniqueId: `${REPO_ID}.7001`, mimeType: "text/xml", content: cda });
console.log("Zapisano dokument:", meta.uniqueId);
console.log("  do indeksu DocumentEntry → hash:", meta.hash, "| rozmiar:", meta.size);

// 3) Obsługa żądania ITI-43 (P1/konsument pobiera dokument). Handler buduje odpowiedź
// z treści ze store'a. We własnym serwerze: weź body żądania POST i zwróć `result.soap`
// z nagłówkiem Content-Type: application/soap+xml.
const requestBody = buildRetrieveDocumentSetBody([
  { repositoryUniqueId: REPO_ID, documentUniqueId: `${REPO_ID}.7001` },
]);
const result = await handleRetrieveDocumentSet(requestBody, store);
console.log("\nObsłużono ITI-43:", result.status, "| zwrócono:", result.returned, "dok.");

// 4) Konsument parsuje odpowiedź i odzyskuje treść.
const docs = parseDocumentResponses(result.soap);
console.log("Odzyskana treść:", docs[0]?.content.toString("utf8"));
console.log(docs[0]?.content.equals(cda) ? "✅ Treść zgodna (round-trip OK)" : "❌ Niezgodna");

// Żądanie nieznanego dokumentu → Failure + RegistryError.
const miss = await handleRetrieveDocumentSet(
  buildRetrieveDocumentSetBody([{ repositoryUniqueId: REPO_ID, documentUniqueId: "NIEMA" }]),
  store,
);
console.log("\nNieznany dokument:", miss.status.split(":").pop(), "| brakuje:", miss.missing);
