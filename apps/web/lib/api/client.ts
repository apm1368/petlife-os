import type { ApiErrorBody } from "@petlife/types";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:4000";
/** Exposed for the one legitimate case a caller needs a full URL rather than a fetch through apiFetch: Google's OAuth login is a real browser navigation, not an XHR. */
export const API_BASE_URL = API_ORIGIN;
const CSRF_COOKIE_NAME = "petlife_csrf";

export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  requestId: string;

  constructor(body: ApiErrorBody["error"], status: number) {
    super(body.message);
    this.code = body.code;
    this.status = status;
    this.details = body.details;
    this.requestId = body.requestId;
  }
}

function readCsrfCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`));
  return match?.[1];
}

/** The CSRF cookie is issued on any API response; a GET is enough to seed it before a retry. */
async function primeCsrfCookie(): Promise<void> {
  await fetch(`${API_ORIGIN}/health/live`, { credentials: "include" });
}

export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

async function send<T>(path: string, options: ApiFetchOptions): Promise<{ response: Response; payload: T | undefined }> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};

  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    const csrf = readCsrfCookie();
    if (csrf) headers["x-csrf-token"] = csrf;
  }
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  const response = await fetch(`${API_ORIGIN}${path}`, {
    method,
    credentials: "include",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : undefined;
  return { response, payload };
}

/**
 * Every call goes through this: credentials are always included (session
 * cookie), the CSRF double-submit header is attached for unsafe methods,
 * and every non-2xx response is normalized into an ApiError so callers
 * never have to parse the { error: {...} } shape themselves.
 *
 * The very first mutating call in a fresh browser session has no CSRF
 * cookie to read yet (nothing has hit the API before), so a CSRF rejection
 * is treated as a one-time "prime and retry" rather than a hard failure.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  let { response, payload } = await send<ApiErrorBody | T>(path, options);

  if (response.status === 403 && (payload as ApiErrorBody)?.error?.code === "CSRF_TOKEN_INVALID") {
    await primeCsrfCookie();
    ({ response, payload } = await send<ApiErrorBody | T>(path, options));
  }

  if (!response.ok) {
    const errorBody = payload as ApiErrorBody | undefined;
    if (errorBody?.error) throw new ApiError(errorBody.error, response.status);
    throw new ApiError({ code: "UNKNOWN_ERROR", message: response.statusText, requestId: "unknown" }, response.status);
  }

  return payload as T;
}
