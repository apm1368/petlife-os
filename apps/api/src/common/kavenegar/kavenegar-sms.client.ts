import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../config/env";
import { toDomesticMobile } from "../sms/domestic-mobile";

export interface KavenegarVerifyLookupInput {
  /** E.164 (+989…) or domestic (09…) mobile. */
  receptor: string;
  /** Verify template name, approved in the Kavenegar panel (English, no spaces or underscores). */
  template: string;
  /** Replaces %token in the template: no spaces, at most 100 characters. */
  token: string;
}

export interface KavenegarSendInput {
  receptor: string;
  message: string;
}

export type KavenegarSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; kind: "TRANSIENT" | "PERMANENT"; code: string };

/** Longest plain-text body Kavenegar accepts on a normal line; longer bodies come back as 413. */
export const KAVENEGAR_MAX_MESSAGE_LENGTH = 1800;

/**
 * Kavenegar status codes worth retrying (https://kavenegar.com/rest.html): 402 (generic "operation failed"),
 * 409 (server cannot answer right now), 451 (too many calls from this IP) and server-side 5xx — except 501,
 * which means the account is still in test mode and may only text its owner. Every other code (bad key, IP not
 * allowed, no credit, unknown template, advanced service off, invalid receptor…) stays wrong until someone fixes
 * the account or the request, so it is permanent.
 */
export function isTransientKavenegarStatus(status: number): boolean {
  if (status === 402 || status === 408 || status === 409 || status === 451) return true;
  return status >= 500 && status <= 599 && status !== 501;
}

/** Per-message statuses that already mean "will not be delivered": failed, undelivered, cancelled, blocked by recipient. */
const FAILED_ENTRY_STATUSES = new Set([6, 11, 13, 14]);

/**
 * Kavenegar REST client: Verify Lookup for one-time codes, sms/send for plain-text notifications.
 * The API key is part of the request path, so the URL is never logged or put into an error (fetch errors can
 * embed it, so they are reduced to a code here); neither are recipients, codes, bodies or provider responses.
 * Callers only ever see a stable code such as `KAVENEGAR_418`.
 */
@Injectable()
export class KavenegarSmsClient {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  verifyLookup(input: KavenegarVerifyLookupInput): Promise<KavenegarSendResult> {
    const receptor = toDomesticMobile(input.receptor);
    if (!receptor) return failed("PERMANENT", "INVALID_RECIPIENT");
    if (!input.token || /\s/.test(input.token) || input.token.length > 100) return failed("PERMANENT", "INVALID_TOKEN");
    return this.call("verify/lookup.json", { receptor, token: input.token, template: input.template, type: "sms" });
  }

  send(input: KavenegarSendInput): Promise<KavenegarSendResult> {
    const receptor = toDomesticMobile(input.receptor);
    if (!receptor) return failed("PERMANENT", "INVALID_RECIPIENT");
    if (!input.message.trim()) return failed("PERMANENT", "EMPTY_MESSAGE");
    if (input.message.length > KAVENEGAR_MAX_MESSAGE_LENGTH) return failed("PERMANENT", "MESSAGE_TOO_LONG");
    // Without `sender` Kavenegar uses the account's default line. hide=1 keeps recipient numbers out of the
    // Kavenegar panel's outbox lists (privacy).
    const sender = this.config.get("KAVENEGAR_SENDER", { infer: true });
    return this.call("sms/send.json", { receptor, message: input.message, hide: "1", ...(sender ? { sender } : {}) });
  }

  private async call(method: string, params: Record<string, string>): Promise<KavenegarSendResult> {
    const apiKey = this.config.get("KAVENEGAR_API_KEY", { infer: true });
    if (!apiKey) return { ok: false, kind: "PERMANENT", code: "KAVENEGAR_NOT_CONFIGURED" };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.get("KAVENEGAR_TIMEOUT_MS", { infer: true }));
    try {
      const baseUrl = this.config.get("KAVENEGAR_BASE_URL", { infer: true });
      const response = await fetch(new URL(`/v1/${encodeURIComponent(apiKey)}/${method}`, baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8", Accept: "application/json" },
        body: new URLSearchParams(params).toString(),
        signal: controller.signal,
      });
      // Errors come back as a non-200 HTTP status equal to return.status, with the JSON body included.
      const body: unknown = await response.json().catch(() => null);
      return interpretKavenegarResponse(response.status, body);
    } catch (error) {
      // Never rethrow or keep `error`: undici's messages and causes can carry the request URL, i.e. the API key.
      return {
        ok: false,
        kind: "TRANSIENT",
        code: error instanceof Error && error.name === "AbortError" ? "PROVIDER_TIMEOUT" : "PROVIDER_UNREACHABLE",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function interpretKavenegarResponse(httpStatus: number, body: unknown): KavenegarSendResult {
  const status = readReturnStatus(body) ?? httpStatus;
  if (status !== 200) {
    return { ok: false, kind: isTransientKavenegarStatus(status) ? "TRANSIENT" : "PERMANENT", code: `KAVENEGAR_${status}` };
  }
  const entry = readFirstEntry(body);
  if (!entry || entry.messageId === null) return { ok: false, kind: "TRANSIENT", code: "INVALID_PROVIDER_RESPONSE" };
  if (entry.status !== null && FAILED_ENTRY_STATUSES.has(entry.status)) {
    return { ok: false, kind: "PERMANENT", code: `KAVENEGAR_ENTRY_${entry.status}` };
  }
  return { ok: true, providerMessageId: entry.messageId };
}

function failed(kind: "TRANSIENT" | "PERMANENT", code: string): Promise<KavenegarSendResult> {
  return Promise.resolve({ ok: false, kind, code });
}

function readReturnStatus(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const ret = (body as Record<string, unknown>).return;
  if (!ret || typeof ret !== "object") return null;
  const status = Number((ret as Record<string, unknown>).status);
  return Number.isInteger(status) ? status : null;
}

function readFirstEntry(body: unknown): { messageId: string | null; status: number | null } | null {
  if (!body || typeof body !== "object") return null;
  const entries = (body as Record<string, unknown>).entries;
  const first = Array.isArray(entries) ? entries[0] : null;
  if (!first || typeof first !== "object") return null;
  const record = first as Record<string, unknown>;
  const id = record.messageid;
  const status = Number(record.status);
  return {
    messageId: typeof id === "string" || typeof id === "number" ? String(id) : null,
    status: Number.isInteger(status) ? status : null,
  };
}
