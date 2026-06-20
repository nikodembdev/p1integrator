import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:https";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseP12 } from "./certificate.js";
import { createNodeHttpClient } from "./node-http-client.js";
import { makeTestCertificate } from "./test-helpers.js";

const testCert = makeTestCertificate("secret");
const { privateKeyPem, certificatePem } = parseP12(testCert.p12, "secret");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  // Serwer wymaga certyfikatu klienta (mTLS); ten sam self-signed cert pełni rolę CA.
  server = createServer(
    {
      key: privateKeyPem,
      cert: certificatePem,
      ca: [certificatePem],
      requestCert: true,
      rejectUnauthorized: true,
    },
    (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end(`echo:${Buffer.concat(chunks).toString("utf8")}`);
      });
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `https://127.0.0.1:${port}/`;
});

afterAll(() => {
  server.close();
});

describe("createNodeHttpClient", () => {
  it("performs an mTLS round-trip presenting the client certificate", async () => {
    const client = createNodeHttpClient({
      tls: {
        pfx: testCert.p12,
        passphrase: "secret",
        ca: certificatePem,
        rejectUnauthorized: false,
      },
    });
    const response = await client.send({
      url: baseUrl,
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    expect(response.status).toBe(200);
    expect(response.body).toBe("echo:hello");
  });

  it("rejects the connection when no client certificate is presented", async () => {
    const client = createNodeHttpClient({ tls: { ca: certificatePem, rejectUnauthorized: false } });
    await expect(
      client.send({ url: baseUrl, method: "POST", headers: {}, body: "x" }),
    ).rejects.toThrow();
  });
});
