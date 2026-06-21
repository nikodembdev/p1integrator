import { generateKeyPairSync } from "node:crypto";
import type { HttpClient, HttpRequest } from "@p1/core";
import { describe, expect, it } from "vitest";
import { ACCESS_DATA_SERVICE_ADDRESS, registerAccessData, registerRepository } from "./szar.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const cert = { privateKeyPem, certificateBase64: "ZHVtbXk=" };

const repoResponse =
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>` +
  `<RejestrowanieRepozytoriumResponse xmlns="http://csioz.gov.pl/p1/szar/ws/v1">` +
  `<identyfikatorRepozytorium>2.16.840.1.113883.3.4424.7.24.99</identyfikatorRepozytorium>` +
  `<wynik><status>SUKCES</status></wynik>` +
  `</RejestrowanieRepozytoriumResponse></soap:Body></soap:Envelope>`;

const accessResponse =
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>` +
  `<RejestrowanieDanychDostepowychResponse xmlns="http://csioz.gov.pl/p1/szar/ws/v1">` +
  `<wynik><status>SUKCES</status></wynik>` +
  `</RejestrowanieDanychDostepowychResponse></soap:Body></soap:Envelope>`;

describe("registerRepository", () => {
  it("buduje podpisane żądanie i parsuje nadany identyfikator", async () => {
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (req) => {
        captured = req;
        return Promise.resolve({ status: 200, headers: {}, body: repoResponse });
      },
    };
    const result = await registerRepository(
      { wsSecurityCertificate: cert, forceNew: true },
      client,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.repositoryUniqueId).toBe("2.16.840.1.113883.3.4424.7.24.99");
      expect(result.value.status).toBe("SUKCES");
    }
    expect(captured?.headers.SOAPAction).toBe("urn:rejestrujRepozytorium");
    expect(captured?.body).toContain("<v1:RejestrowanieRepozytoriumRequest>");
    expect(captured?.body).toContain("<v11:wymusUtworzenieNowegoRepozytorium>true");
    expect(captured?.body).toContain("<ds:Signature");
  });
});

describe("registerAccessData", () => {
  it("buduje żądanie z adresem usługi i parsuje status", async () => {
    let captured: HttpRequest | undefined;
    const client: HttpClient = {
      send: (req) => {
        captured = req;
        return Promise.resolve({ status: 200, headers: {}, body: accessResponse });
      },
    };
    const result = await registerAccessData(
      {
        wsSecurityCertificate: cert,
        repositoryUniqueId: "2.16.840.1.113883.3.4424.7.24.99",
        serviceAddress: "https://repo.example/services/iti43",
      },
      client,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("SUKCES");
    expect(captured?.headers.SOAPAction).toBe("urn:rejestrujDaneDostepowe");
    expect(captured?.body).toContain(
      `<v11:parametr klucz="${ACCESS_DATA_SERVICE_ADDRESS}" wartosc="https://repo.example/services/iti43"/>`,
    );
    expect(captured?.body).toContain(
      "<v11:identyfikatorRepozytorium>2.16.840.1.113883.3.4424.7.24.99",
    );
  });

  it("mapuje błąd sieci na błąd transportu", async () => {
    const client: HttpClient = { send: () => Promise.reject(new Error("ECONNREFUSED")) };
    const result = await registerAccessData(
      { wsSecurityCertificate: cert, repositoryUniqueId: "R", serviceAddress: "https://x" },
      client,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("transport");
  });
});
