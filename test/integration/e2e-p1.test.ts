/**
 * Test e2e: realnie wystawia skierowanie na P1 INTEGRACJĘ przez naszą libkę
 * (XAdES → SOAP+WS-Security → mTLS → WynikMT) i sprawdza, że P1 zwraca Sukces.
 *
 * TWORZY REALNY DOKUMENT na integracji (zwraca kodSkierowania). Domyślnie POMIJANY.
 * Uruchom świadomie: `P1_E2E=1 pnpm test:e2e` (dane konta z `.local/p1.env`, certy z .local).
 * Żadnych danych konta w repo — wszystko z env (patrz p1-account.ts / .env.example).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { issueGeneralReferral, type ReferralTransport } from "@p1/referral";
import { createDssDocumentSigner } from "@p1/signing";
import { createNodeHttpClient, parseP12 } from "@p1/transport";
import { describe, expect, it } from "vitest";
import {
  buildE2eGeneralInput,
  e2eContext,
  p1Account as a,
  p1AccountComplete,
} from "./p1-account.js";

const RUN = process.env.P1_E2E === "1";
const certsPresent =
  existsSync(resolve(a.certDir, "Adam713 Leczniczy.p12")) &&
  existsSync(resolve(a.certDir, "Podmiot_leczniczy_713-tls.p12")) &&
  existsSync(resolve(a.certDir, "Podmiot_leczniczy_713-wss.p12"));

describe.skipIf(!RUN || !p1AccountComplete || !certsPresent)(
  "e2e P1 integracja — wystawienie skierowania",
  () => {
    it("zwraca Sukces i kodSkierowania", async () => {
      const tls = parseP12(
        readFileSync(resolve(a.certDir, "Podmiot_leczniczy_713-tls.p12")),
        a.certPassword,
      );
      const transport: ReferralTransport = {
        context: e2eContext,
        documentSigner: createDssDocumentSigner({
          endpoint: a.xadesUrl,
          certificate: {
            p12: readFileSync(resolve(a.certDir, "Adam713 Leczniczy.p12")),
            password: a.certPassword,
          },
        }),
        httpClient: createNodeHttpClient({
          tls: {
            key: tls.privateKeyPem,
            cert: tls.certificatePem,
            rejectUnauthorized: a.rejectUnauthorized,
          },
        }),
        wsSecurityCertificate: parseP12(
          readFileSync(resolve(a.certDir, "Podmiot_leczniczy_713-wss.p12")),
          a.certPassword,
        ),
        endpoint: a.endpoint,
      };

      const result = await issueGeneralReferral(buildE2eGeneralInput(), transport);
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (result.ok) {
        expect(result.value.outcome?.major).toBe("urn:csioz:p1:kod:major:Sukces");
        expect(result.value.referralCode).toBeTruthy();
        // eslint-disable-next-line no-console
        console.log("P1 OK — kodSkierowania:", result.value.referralCode);
      }
    });
  },
);
