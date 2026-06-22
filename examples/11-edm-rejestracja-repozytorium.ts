// EDM: rejestracja własnego repozytorium XDS.b (SZAR). Fundament modelu, w którym
// treść dokumentów trzyma podmiot, a P1 prowadzi tylko rejestr indeksów.
// pnpm tsx examples/11-edm-rejestracja-repozytorium.ts
import { registerAccessData, registerRepository } from "@p1/edm";
import { edmTransport, endpoints } from "./config.js";

const edm = edmTransport();
if (!edm) {
  console.log("Brak konfiguracji P1 (.local/p1.env + certy) - przykład wymaga połączenia z P1.");
  process.exit(0);
}

// 1) Rejestracja repozytorium - P1 nadaje unikalny identyfikator repozytorium.
const repo = await registerRepository(
  { endpoint: endpoints.edmSzar, wsSecurityCertificate: edm.wsSecurityCertificate },
  edm.httpClient,
);
if (!repo.ok) {
  console.error("❌ rejestrujRepozytorium:", repo.error.kind, "-", repo.error.message);
  process.exit(1);
}
console.log(
  "Repozytorium:",
  repo.value.repositoryUniqueId ?? "(brak)",
  "| status:",
  repo.value.status,
  repo.value.description ?? "",
);
// BLAD zwykle oznacza, że podmiot ma już zarejestrowane repozytorium - użyj forceNew,
// by utworzyć kolejne: registerRepository({ ..., forceNew: true }).

// 2) Rejestracja danych dostępowych - publiczny adres usługi ITI-43 repozytorium.
// UWAGA: P1 weryfikuje, że adres jest osiągalny w sieci publicznej - podaj realny URL.
if (repo.value.repositoryUniqueId) {
  const access = await registerAccessData(
    {
      endpoint: endpoints.edmSzar,
      wsSecurityCertificate: edm.wsSecurityCertificate,
      repositoryUniqueId: repo.value.repositoryUniqueId,
      serviceAddress: "https://twoje-repo.example.pl/services/ObslugaRedDzIti43WS",
    },
    edm.httpClient,
  );
  if (access.ok) {
    console.log("\nrejestrujDaneDostepowe:", access.value.status, access.value.description ?? "");
  } else {
    console.error("❌ rejestrujDaneDostepowe:", access.error.message);
  }
}
