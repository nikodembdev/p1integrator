import type { HttpClient, HttpRequest, HttpResponse } from "@p1/core";
import type { IncomingHttpHeaders } from "node:http";
import { Agent, type AgentOptions, request as httpsRequest } from "node:https";

export interface NodeHttpClientTls {
  readonly pfx?: Buffer;
  readonly passphrase?: string;
  readonly key?: string | Buffer;
  readonly cert?: string | Buffer;
  readonly ca?: string | Buffer | ReadonlyArray<string | Buffer>;
  /** Tylko do testów/diagnostyki — w produkcji zostaw domyślne (true). */
  readonly rejectUnauthorized?: boolean;
}

export interface NodeHttpClientOptions {
  readonly tls: NodeHttpClientTls;
  readonly timeoutMs?: number;
}

/** Adapter `HttpClient` na `node:https` z mTLS (certyfikat klienta P1). */
export function createNodeHttpClient(options: NodeHttpClientOptions): HttpClient {
  const { tls } = options;
  const agentOptions: AgentOptions = {
    keepAlive: true,
    rejectUnauthorized: tls.rejectUnauthorized ?? true,
    ...(tls.pfx !== undefined ? { pfx: tls.pfx } : {}),
    ...(tls.passphrase !== undefined ? { passphrase: tls.passphrase } : {}),
    ...(tls.key !== undefined ? { key: tls.key } : {}),
    ...(tls.cert !== undefined ? { cert: tls.cert } : {}),
    ...(tls.ca !== undefined ? { ca: tls.ca as string | Buffer | Array<string | Buffer> } : {}),
  };
  const agent = new Agent(agentOptions);
  const timeout = options.timeoutMs ?? 60_000;

  return {
    send(request: HttpRequest): Promise<HttpResponse> {
      return new Promise<HttpResponse>((resolve, reject) => {
        const url = new URL(request.url);
        const req = httpsRequest(
          {
            method: request.method,
            hostname: url.hostname,
            port: url.port === "" ? 443 : Number(url.port),
            path: `${url.pathname}${url.search}`,
            headers: { ...request.headers },
            agent,
            timeout,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("end", () => {
              resolve({
                status: res.statusCode ?? 0,
                headers: normalizeHeaders(res.headers),
                body: Buffer.concat(chunks).toString("utf8"),
              });
            });
          },
        );
        req.on("error", reject);
        req.on("timeout", () => req.destroy(new Error(`Request timed out after ${timeout}ms`)));
        if (request.body !== undefined) req.write(request.body);
        req.end();
      });
    },
  };
}

function normalizeHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    normalized[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return normalized;
}
