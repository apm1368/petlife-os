import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";

/**
 * HTTP client for the FarazSMS public web service (https://docs.farazsms.com — OpenAPI at
 * /download/openapi.json). Auth is a static key in the case-sensitive `Api-Key` header; every
 * response is the envelope `{ status: "success" | "error", data, messages }`.
 *
 * Only this file knows FarazSMS endpoint paths, field names and number formats; the OTP provider,
 * the notification adapter and the admin pattern screen all go through it.
 */

export const FARAZ_DEFAULT_BASE_URL = "https://api.iranpayamak.com";
const REQUEST_TIMEOUT_MS = 15_000;

/** Pattern categories as the API numbers them. */
export const FARAZ_PATTERN_CATEGORIES = { otp: 1, club: 2, order: 3, others: 255 } as const;
export type FarazPatternCategory = keyof typeof FARAZ_PATTERN_CATEGORIES;
export type FarazPatternVarType = "int" | "str" | "date";

export interface FarazPatternVar {
  var: string;
  length: number;
  type: FarazPatternVarType;
}

export interface FarazPatternInput {
  text: string;
  description?: string;
  website: string;
  shared: boolean;
  category: FarazPatternCategory;
  vars: FarazPatternVar[];
}

export class FarazSmsError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the request never got a response (network error, timeout). */
    readonly httpStatus: number,
    /** Retrying the same request may succeed (network failure, timeout, 429, 5xx). */
    readonly transient: boolean,
    readonly providerMessages: string[] = [],
  ) {
    super(message);
    this.name = "FarazSmsError";
  }
}

interface FarazEnvelope<T> {
  status?: "success" | "error";
  data?: T;
  messages?: unknown;
  message?: unknown;
}

/** Flattens the API's `messages` field (string | string[] | { field: string | string[] }) into plain strings. */
function flattenMessages(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenMessages);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(flattenMessages);
  return [String(value)];
}

/** FarazSMS wants local mobile numbers (09xxxxxxxxx), never +98. Accepts E.164 or local input. */
export function toFarazRecipient(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("98") && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.startsWith("9") && digits.length === 10) return `0${digits}`;
  return digits;
}

@Injectable()
export class FarazSmsClient {
  private readonly logger = new Logger("FarazSmsClient");

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  /** True when an API key and a sender line are set — the minimum for any real call. */
  isConfigured(): boolean {
    return Boolean(this.config.get("FARAZ_SMS_API_KEY", { infer: true }) && this.config.get("FARAZ_SMS_SENDER", { infer: true }));
  }

  sender(): string | undefined {
    return this.config.get("FARAZ_SMS_SENDER", { infer: true }) || undefined;
  }

  async getBalance(): Promise<{ balanceAmount: number; balanceCount: number }> {
    const data = await this.request<{ balanceAmount: number; balanceCount: number }>("GET", "/ws/v1/account/balance");
    return { balanceAmount: Number(data?.balanceAmount ?? 0), balanceCount: Number(data?.balanceCount ?? 0) };
  }

  /** Lines the account may send from. The response shape is undocumented, so it is passed through as-is. */
  getAccessibleLines(): Promise<unknown> {
    return this.request<unknown>("GET", "/ws/v1/lines/accessible");
  }

  /** The list endpoint is a GET that documents an (optional) JSON filter body; no filter is sent. Shape passed through. */
  listPatterns(): Promise<unknown> {
    return this.request<unknown>("GET", "/ws/v1/patterns");
  }

  getPattern(code: string): Promise<unknown> {
    return this.request<unknown>("GET", `/ws/v1/patterns/${encodeURIComponent(code)}`);
  }

  /** New patterns are reviewed by FarazSMS before they can be sent; the returned data is the new pattern's code. */
  createPattern(input: FarazPatternInput): Promise<unknown> {
    return this.request<unknown>("POST", "/ws/v1/patterns", {
      text: input.text,
      description: input.description ?? "",
      share: input.shared ? 1 : 0,
      website: input.website,
      category: FARAZ_PATTERN_CATEGORIES[input.category],
      vars: input.vars,
    });
  }

  deletePattern(code: string): Promise<unknown> {
    return this.request<unknown>("DELETE", `/ws/v1/patterns/${encodeURIComponent(code)}`);
  }

  /** Pattern (template) send — the fast, unmoderated path FarazSMS recommends for OTP. Returns the send-request id. */
  async sendPattern(input: { code: string; recipient: string; attributes: Record<string, string> }): Promise<string> {
    const lineNumber = this.requireSender();
    const id = await this.request<number | string>("POST", "/ws/v1/sms/pattern", {
      code: input.code,
      attributes: input.attributes,
      recipient: toFarazRecipient(input.recipient),
      line_number: lineNumber,
      number_format: "english",
    });
    return String(id ?? "");
  }

  /** Free-text send. FarazSMS queues and moderates these, so delivery can take minutes; never use it for OTP. */
  async sendSimple(input: { text: string; recipients: string[] }): Promise<string> {
    const lineNumber = this.requireSender();
    const id = await this.request<number | string>("POST", "/ws/v1/sms/simple", {
      text: input.text,
      line_number: lineNumber,
      recipients: input.recipients.map(toFarazRecipient),
      number_format: "english",
    });
    return String(id ?? "");
  }

  private requireSender(): string {
    const sender = this.sender();
    if (!sender) throw new FarazSmsError("FARAZ_SMS_SENDER is not configured.", 0, false);
    return sender;
  }

  private async request<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
    const apiKey = this.config.get("FARAZ_SMS_API_KEY", { infer: true });
    if (!apiKey) throw new FarazSmsError("FARAZ_SMS_API_KEY is not configured.", 0, false);
    const baseUrl = (this.config.get("FARAZ_SMS_BASE_URL", { infer: true }) || FARAZ_DEFAULT_BASE_URL).replace(/\/+$/, "");

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "Api-Key": apiKey, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`FarazSMS ${method} ${path} failed before a response: ${reason}`);
      throw new FarazSmsError(`FarazSMS is unreachable: ${reason}`, 0, true);
    }

    const text = await response.text();
    let envelope: FarazEnvelope<T> = {};
    try {
      envelope = text ? (JSON.parse(text) as FarazEnvelope<T>) : {};
    } catch {
      // Non-JSON body (an HTML error page from a proxy, typically) — handled by the status checks below.
    }
    const messages = flattenMessages(envelope.messages ?? envelope.message);

    if (!response.ok || envelope.status === "error") {
      const transient = response.status === 0 || response.status === 429 || response.status >= 500;
      const summary = messages.join(" | ") || `HTTP ${response.status}`;
      this.logger.warn(`FarazSMS ${method} ${path} rejected: ${summary}`);
      throw new FarazSmsError(summary, response.status, transient, messages);
    }
    return envelope.data as T;
  }
}
