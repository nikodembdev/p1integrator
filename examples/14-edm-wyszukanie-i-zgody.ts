// EDM: wyszukanie indeksów pacjenta (ITI-18), weryfikacja zgody (SOZ) i pobranie
// treści (ITI-43). Ścieżka konsumenta dokumentacji.
// pnpm tsx examples/14-edm-wyszukanie-i-zgody.ts
import { findDocuments, requestSamlToken, retrieveDocumentSet, verifyAccess } from "@p1/edm";
import { edmContext, edmPatientCx, EDM_OID, edmTransport, endpoints, patient } from "./config.js";

const edm = edmTransport();
if (!edm) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - przykład wymaga połączenia z P1.");
  process.exit(0);
}

// Token SAML (strona żądająca + pacjent) - używany we wszystkich operacjach EDM.
const token = await requestSamlToken(
  {
    endpoint: endpoints.edmToken,
    context: edmContext,
    wsSecurityCertificate: edm.wsSecurityCertificate,
    patient: { root: EDM_OID.pesel, extension: patient.pesel },
  },
  edm.httpClient,
);
if (!token.ok) {
  console.error("❌ token SAML:", token.error.message);
  process.exit(1);
}
const assertionXml = token.value.assertionXml;
const wsSecurityCertificate = edm.wsSecurityCertificate;
console.log("✅ Token SAML:", token.value.assertionId);

// 1) ITI-18: wyszukanie indeksów dokumentów pacjenta (status Approved).
const search = await findDocuments(
  { endpoint: endpoints.edmIti18, assertionXml, wsSecurityCertificate, patientId: edmPatientCx },
  edm.httpClient,
);
if (!search.ok) {
  console.error("❌ ITI-18:", search.error.message);
  process.exit(1);
}
console.log(
  `\n✅ ITI-18: status ${search.value.status?.split(":").pop()}, znaleziono ${search.value.documents.length}`,
);
const doc = search.value.documents[0];
for (const d of search.value.documents.slice(0, 5)) {
  console.log(
    `  - ${d.uniqueId ?? "?"} | repo ${d.repositoryUniqueId ?? "?"} | zdarzenie ${d.medicalEventId ?? "?"}`,
  );
}
if (!doc?.uniqueId || !doc.repositoryUniqueId) {
  console.log(
    "Brak indeksów do dalszych kroków (rejestr może zwrócić timeout dla pacjenta z dużą liczbą danych).",
  );
  process.exit(0);
}

// 2) SOZ: weryfikacja uprawnienia do udostępnienia dokumentu (decyzja XACML).
const decision = await verifyAccess(
  { endpoint: endpoints.edmSoz, assertionXml, wsSecurityCertificate, documentIds: [doc.uniqueId] },
  edm.httpClient,
);
console.log(
  "\n✅ SOZ decyzja:",
  decision.ok ? (decision.value.decision ?? "(brak)") : `BŁĄD ${decision.error.message}`,
);

// 3) ITI-43: pobranie treści z repozytorium wskazanego w indeksie.
const content = await retrieveDocumentSet(
  {
    endpoint: endpoints.edmIti18.replace("Iti18", "Iti43"), // repo wg indeksu; tu poglądowo
    assertionXml,
    wsSecurityCertificate,
    documents: [{ repositoryUniqueId: doc.repositoryUniqueId, documentUniqueId: doc.uniqueId }],
  },
  edm.httpClient,
);
console.log("\n=== ITI-43 ===");
if (content.ok) {
  console.log(
    "status:",
    content.value.status?.split(":").pop(),
    "| dokumentów:",
    content.value.documents.length,
  );
  if (content.value.documents[0]) {
    console.log("treść (bajtów):", content.value.documents[0].content.length);
  }
} else {
  console.error("❌", content.error.message);
}
