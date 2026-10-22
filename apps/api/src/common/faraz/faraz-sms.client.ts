import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../config/env";

export interface FarazPatternSendInput {
  patternCode: string;
  recipient: string;
  attributes: Record<string, string | number>;
}

export type FarazPatternSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; kind: "TRANSIENT" | "PERMANENT"; code: string };

/** Official FarazSMS Pattern API client. It never logs credentials, OTPs, recipients, or provider bodies. */
@Injectable()
export class FarazSmsClient {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async sendPattern(input: FarazPatternSendInput): Promise<FarazPatternSendResult> {
    const recipient = toDomesticMobile(input.recipient);
    if (!recipient) return { ok: false, kind: "PERMANENT", code: "INVALID_RECIPIENT" };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.get("FARAZ_SMS_TIMEOUT_MS", { infer: true }));
    try {
      const baseUrl = this.config.get("FARAZ_SMS_BASE_URL", { infer: true });
      const response = await fetch(new URL("/ws/v1/sms/pattern", baseUrl), {
        method: "POST",
        headers: {
          "Api-Key": this.config.get("FARAZ_SMS_API_KEY", { infer: true })!,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          code: input.patternCode,
          attributes: input.attributes,
          recipient,
          line_number: this.config.get("FARAZ_SMS_SENDER", { infer: true }),
          number_format: "english",
        }),
        signal: controller.signal,
      });

      if (!response.ok) return classifyHttpFailure(response.status);
      const body: unknown = await response.json().catch(() => null);
      const providerMessageId = readProviderMessageId(body);
      if (!providerMessageId || isExplicitFailure(body)) {
        return { ok: false, kind: "TRANSIENT", code: "INVALID_PROVIDER_RESPONSE" };
      }
      return { ok: true, providerMessageId };
    } catch (error) {
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

export function toDomesticMobile(value: string): string | null {
  if (/^\+989\d{9}$/.test(value)) return `0${value.slice(3)}`;
  if (/^09\d{9}$/.test(value)) return value;
  return null;
}

function classifyHttpFailure(status: number): FarazPatternSendResult {
  const transient = status === 408 || status === 425 || status === 429 || status >= 500;
  return { ok: false, kind: transient ? "TRANSIENT" : "PERMANENT", code: `PROVIDER_HTTP_${status}` };
}

function readProviderMessageId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const data = root.data;
  if (typeof data === "string" || typeof data === "number") return String(data);
  if (data && typeof data === "object") {
    const id = (data as Record<string, unknown>).id;
    if (typeof id === "string" || typeof id === "number") return String(id);
  }
  const id = root.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

function isExplicitFailure(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const meta = (value as Record<string, unknown>).meta;
  if (!meta || typeof meta !== "object") return false;
  const status = (meta as Record<string, unknown>).status;
  return status === false || status === "failed" || status === "error";
}
