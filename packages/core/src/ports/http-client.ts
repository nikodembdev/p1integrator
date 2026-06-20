export type HttpMethod = "GET" | "POST";

export interface HttpRequest {
  readonly url: string;
  readonly method: HttpMethod;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/**
 * Port transportu HTTP. Konfiguracja połączenia (mTLS, timeouty, retry, proxy)
 * jest sprawą adaptera — rdzeń zna tylko request/response. Domyślny adapter
 * (Node + mTLS) dostarcza `@p1/transport`.
 */
export interface HttpClient {
  send(request: HttpRequest): Promise<HttpResponse>;
}
