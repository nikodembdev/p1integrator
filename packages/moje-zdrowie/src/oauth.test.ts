import { describe, expect, it } from "vitest";
import { SGOA_FHIR_SCOPE } from "./constants.js";
import { buildSgoaTokenRequest } from "./oauth.js";

const base = {
  tokenEndpoint: "https://isus.example/token",
  privateKeyPem: "-----BEGIN PRIVATE KEY-----\n...",
  subject: "2.16.840.1.113883.3.4424.2.3.1:000000927722",
  userId: "2.16.840.1.113883.3.4424.1.6.2:4727124",
} as const;

describe("buildSgoaTokenRequest", () => {
  it("ustawia scope SGO-A i domyślny issuer = subject", () => {
    const result = buildSgoaTokenRequest({ ...base, userRole: "LEK" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.scope).toBe(SGOA_FHIR_SCOPE);
    expect(result.value.issuer).toBe(base.subject);
    expect(result.value.subject).toBe(base.subject);
    expect(result.value.userRole).toBe("LEK");
    // SGO-A nie używa purpose - nie może wyciec do assertion.
    expect("purpose" in result.value).toBe(false);
  });

  it("pozwala nadpisać issuer (np. Serial Number certyfikatu)", () => {
    const result = buildSgoaTokenRequest({ ...base, userRole: "PIEL", issuer: "SN-12345" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.issuer).toBe("SN-12345");
  });

  it("przekazuje kontekst miejsca i asystenta", () => {
    const result = buildSgoaTokenRequest({
      ...base,
      userRole: "ASYS",
      childOrganization: "2.16.840.1.113883.3.4424.2.3.3:000000927722-001",
      assistantContext: "2.16.840.1.113883.3.4424.1.6.2:4727124",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.childOrganization).toBe("2.16.840.1.113883.3.4424.2.3.3:000000927722-001");
    expect(result.value.assistantContext).toBe("2.16.840.1.113883.3.4424.1.6.2:4727124");
  });

  it("odrzuca rolę ASYS bez kontekstu pracownika medycznego", () => {
    const result = buildSgoaTokenRequest({ ...base, userRole: "ASYS" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("validation");
    expect(result.error.message).toContain("ASYS");
  });
});
