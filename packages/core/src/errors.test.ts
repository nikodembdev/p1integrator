import { describe, expect, it } from "vitest";
import {
  businessErrorFromOutcome,
  P1AuthenticationError,
  P1AuthorizationError,
  P1BusinessError,
  P1Error,
  P1ServerError,
  P1TransportError,
  P1ValidationError,
  parseErrorCodeMajor,
  parseErrorCodeMinor,
  technicalErrorToP1Error,
} from "./errors.js";

describe("parseErrorCode", () => {
  it("recognizes known URNs", () => {
    expect(parseErrorCodeMajor("urn:csioz:p1:kodBleduMajor:bladWewnetrzny")).toBe("bladWewnetrzny");
    expect(parseErrorCodeMinor("urn:csioz:p1:kodBleduMinor:bladKontekstu")).toBe("bladKontekstu");
  });

  it("returns undefined for unknown URNs", () => {
    expect(parseErrorCodeMajor("urn:nieznany")).toBeUndefined();
    expect(parseErrorCodeMinor("urn:nieznany")).toBeUndefined();
  });
});

describe("technicalErrorToP1Error", () => {
  it("maps authentication to P1AuthenticationError (not retryable)", () => {
    const error = technicalErrorToP1Error({ major: "bladUwierzytelnieniaWSS" });
    expect(error).toBeInstanceOf(P1AuthenticationError);
    expect(error.kind).toBe("authentication");
    expect(error.retryable).toBe(false);
  });

  it("maps authorization to P1AuthorizationError", () => {
    expect(technicalErrorToP1Error({ major: "bladAutoryzacji" })).toBeInstanceOf(
      P1AuthorizationError,
    );
  });

  it("treats internal error and timeout as retryable", () => {
    expect(technicalErrorToP1Error({ major: "bladWewnetrzny" })).toBeInstanceOf(P1ServerError);
    expect(technicalErrorToP1Error({ major: "bladWewnetrzny" }).retryable).toBe(true);
    expect(technicalErrorToP1Error({ major: "przekroczonyCzas" })).toBeInstanceOf(P1TransportError);
    expect(technicalErrorToP1Error({ major: "przekroczonyCzas" }).retryable).toBe(true);
  });

  it("gives minor precedence over major", () => {
    const error = technicalErrorToP1Error({
      major: "niepoprawnyKomunikat",
      minor: "brakUprawnienPracownikaMedycznego",
    });
    expect(error).toBeInstanceOf(P1AuthorizationError);
  });

  it("maps an invalid message to P1ValidationError", () => {
    expect(technicalErrorToP1Error({ major: "niepoprawnyKomunikat" })).toBeInstanceOf(
      P1ValidationError,
    );
  });

  it("preserves the raw technical code and sets name", () => {
    const code = { major: "kontoZablokowane", description: "Konto zablokowane" } as const;
    const error = technicalErrorToP1Error(code);
    expect(error.technical).toEqual(code);
    expect(error.message).toBe("Konto zablokowane");
    expect(error.name).toBe("P1AuthenticationError");
    expect(error).toBeInstanceOf(P1Error);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("businessErrorFromOutcome", () => {
  it("wraps the OperationOutcome and uses its message", () => {
    const error = businessErrorFromOutcome({ major: "urn:x:rejected", message: "Rejected" });
    expect(error).toBeInstanceOf(P1BusinessError);
    expect(error.kind).toBe("business");
    expect(error.message).toBe("Rejected");
    expect(error.outcome?.major).toBe("urn:x:rejected");
  });

  it("falls back to major when message is missing", () => {
    expect(businessErrorFromOutcome({ major: "urn:x:code" }).message).toBe("urn:x:code");
  });
});
