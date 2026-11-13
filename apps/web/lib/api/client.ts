import type { ApiErrorBody } from "@petlife/types";
import { isLocalPreview } from "@/lib/local-preview";

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
  cache?: RequestCache;
}

/**
 * Route params reach API paths unencoded, and Next decodes `%2F`/`%23` inside them, so a crafted link such as
 * `/fa/community/messages/..%2F..%2Fsomething%23` would otherwise make the visitor's browser call a different API
 * route with their session cookie and CSRF header. A path is used only when it has no dot segments, backslashes,
 * fragments or control characters; anything else is refused before a request is made.
 */
export function assertSafeApiPath(path: string): void {
  const pathname = path.split("?")[0] ?? "";
  const dotSegment = (segment: string) => /^(?:\.|%2e){1,2}$/i.test(segment);
  const controlChar = [...path].some((char) => char.charCodeAt(0) < 0x20);
  const unsafe = !pathname.startsWith("/") || pathname.startsWith("//") || /[\\#]/.test(path) || controlChar || pathname.split("/").some(dotSegment);
  if (unsafe) throw new ApiError({ code: "INVALID_API_PATH", message: "Invalid request path", requestId: "client" }, 400);
}

async function send<T>(path: string, options: ApiFetchOptions): Promise<{ response: Response; payload: T | undefined }> {
  assertSafeApiPath(path);
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
    ...(options.cache ? { cache: options.cache } : {}),
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
/** Dispatched on window when an admin call answers ADMIN_TWO_STEP_REQUIRED, so the Admin Shell can ask for the code. */
export const ADMIN_TWO_STEP_EVENT = "opl:admin-two-step-required";

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  if (isLocalPreview() && options.method && options.method !== "GET") {
    throw new ApiError({ code: "LOCAL_PREVIEW_READ_ONLY", message: "Local preview is read-only", requestId: "local-preview" }, 403);
  }
  let { response, payload } = await send<ApiErrorBody | T>(path, options);

  if (response.status === 403 && (payload as ApiErrorBody)?.error?.code === "CSRF_TOKEN_INVALID") {
    await primeCsrfCookie();
    ({ response, payload } = await send<ApiErrorBody | T>(path, options));
  }

  if (!response.ok) {
    const errorBody = payload as ApiErrorBody | undefined;
    if (errorBody?.error?.code === "ADMIN_TWO_STEP_REQUIRED" && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ADMIN_TWO_STEP_EVENT));
    if (errorBody?.error) throw new ApiError(errorBody.error, response.status);
    throw new ApiError({ code: "UNKNOWN_ERROR", message: response.statusText, requestId: "unknown" }, response.status);
  }

  return payload as T;
}
