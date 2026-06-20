import { P1ServerError, P1TransportError } from "@p1/core";
import { describe, expect, it } from "vitest";
import { createDssDocumentSigner, type FetchLike } from "./dss-document-signer.js";

const certificate = { p12: Buffer.from("fake-p12-bytes"), password: "secret" };

describe("createDssDocumentSigner", () => {
  it("posts a multipart document + certificate + password and returns the signed XML", async () => {
    let captured: { url: string; body: FormData } | undefined;
    const fakeFetch: FetchLike = (url, init) => {
      captured = { url, body: init.body };
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("<signed/>") });
    };
    const signer = createDssDocumentSigner({
      endpoint: "https://dss/api/v1/sign",
      certificate,
      fetch: fakeFetch,
    });

    const signed = await signer.signXades("<doc/>");
    expect(signed).toBe("<signed/>");
    expect(captured?.url).toBe("https://dss/api/v1/sign");
    expect(captured?.body.get("keystorePassword")).toBe("secret");
    expect(captured?.body.get("document")).toBeInstanceOf(Blob);
    expect(captured?.body.get("certificate")).toBeInstanceOf(Blob);
  });

  it("maps a non-2xx response to P1ServerError", async () => {
    const fakeFetch: FetchLike = () =>
      Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("boom") });
    const signer = createDssDocumentSigner({
      endpoint: "https://dss",
      certificate,
      fetch: fakeFetch,
    });
    await expect(signer.signXades("<doc/>")).rejects.toBeInstanceOf(P1ServerError);
  });

  it("maps a network failure to P1TransportError", async () => {
    const fakeFetch: FetchLike = () => Promise.reject(new Error("ECONNREFUSED"));
    const signer = createDssDocumentSigner({
      endpoint: "https://dss",
      certificate,
      fetch: fakeFetch,
    });
    await expect(signer.signXades("<doc/>")).rejects.toBeInstanceOf(P1TransportError);
  });
});
