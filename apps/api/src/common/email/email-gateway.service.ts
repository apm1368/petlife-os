import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";
import type { AppEnv } from "../../config/env";

export type EmailProviderName = "disabled" | "dev" | "gmail" | "smtp";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Free-form tag for logs and delivery rows (template key). */
  tag?: string;
}

export type EmailSendResult =
  | { status: "SENT"; messageId: string | null }
  | { status: "FAILED"; failureKind: "TRANSIENT" | "PERMANENT"; failureCode: string; failureMessage: string };

export interface EmailStatus {
  provider: EmailProviderName;
  live: boolean;
  fromAddress: string | null;
  fromName: string;
  missingConfiguration: string[];
}

/** SMTP reply codes 5xx are permanent (bad mailbox, auth rejected); everything else is retried. */
function classify(error: unknown): EmailSendResult {
  const e = error as { responseCode?: number; code?: string; message?: string };
  const permanent = typeof e.responseCode === "number" ? e.responseCode >= 500 : e.code === "EAUTH" || e.code === "EENVELOPE";
  return {
    status: "FAILED",
    failureKind: permanent ? "PERMANENT" : "TRANSIENT",
    failureCode: e.code ?? (e.responseCode ? `SMTP_${e.responseCode}` : "EMAIL_SEND_FAILED"),
    failureMessage: (e.message ?? "Email could not be sent.").slice(0, 500),
  };
}

/**
 * The one place email leaves the platform. Gmail uses smtp.gmail.com:465 with an App Password; "smtp" is any
 * relay. Credentials come only from the server environment and are never logged or returned by any endpoint.
 */
@Injectable()
export class EmailGatewayService {
  private readonly logger = new Logger("EmailGateway");
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  private get provider(): EmailProviderName {
    return this.config.get("EMAIL_PROVIDER", { infer: true });
  }

  status(): EmailStatus {
    const provider = this.provider;
    const fromAddress = this.fromAddress();
    const missing: string[] = [];
    if (provider === "gmail") {
      if (!this.config.get("GMAIL_USER", { infer: true })) missing.push("GMAIL_USER");
      if (!this.config.get("GMAIL_APP_PASSWORD", { infer: true })) missing.push("GMAIL_APP_PASSWORD");
    }
    if (provider === "smtp") {
      for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM_ADDRESS"] as const) if (!this.config.get(key, { infer: true })) missing.push(key);
    }
    if (provider === "disabled") missing.push("EMAIL_PROVIDER");
    return { provider, live: (provider === "gmail" || provider === "smtp") && missing.length === 0, fromAddress, fromName: this.config.get("EMAIL_FROM_NAME", { infer: true }), missingConfiguration: missing };
  }

  /** True when a real or dev provider will accept messages (dev only logs). */
  isEnabled(): boolean {
    const s = this.status();
    return s.live || s.provider === "dev";
  }

  private fromAddress(): string | null {
    return this.config.get("EMAIL_FROM_ADDRESS", { infer: true }) ?? (this.provider === "gmail" ? this.config.get("GMAIL_USER", { infer: true }) ?? null : null);
  }

  private transport(): Transporter {
    if (this.transporter) return this.transporter;
    const timeout = this.config.get("EMAIL_TIMEOUT_MS", { infer: true });
    if (this.provider === "gmail") {
      this.transporter = createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: this.config.get("GMAIL_USER", { infer: true }), pass: this.config.get("GMAIL_APP_PASSWORD", { infer: true })?.replace(/\s+/g, "") },
        connectionTimeout: timeout,
        greetingTimeout: timeout,
        socketTimeout: timeout,
      });
    } else {
      this.transporter = createTransport({
        host: this.config.get("SMTP_HOST", { infer: true }),
        port: this.config.get("SMTP_PORT", { infer: true }),
        secure: this.config.get("SMTP_SECURE", { infer: true }),
        auth: { user: this.config.get("SMTP_USER", { infer: true }), pass: this.config.get("SMTP_PASSWORD", { infer: true }) },
        connectionTimeout: timeout,
        greetingTimeout: timeout,
        socketTimeout: timeout,
      });
    }
    return this.transporter;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const status = this.status();
    if (status.provider === "dev") {
      this.logger.log(`[DEV EMAIL] to=${message.to.replace(/(^.).*(@.*$)/, "$1***$2")} subject="${message.subject}" tag=${message.tag ?? "-"}`);
      return { status: "SENT", messageId: null };
    }
    if (!status.live) {
      return { status: "FAILED", failureKind: "PERMANENT", failureCode: "EMAIL_NOT_CONFIGURED", failureMessage: `Email provider is not configured (${status.missingConfiguration.join(", ")}).` };
    }
    try {
      const replyTo = this.config.get("EMAIL_REPLY_TO", { infer: true });
      const info = await this.transport().sendMail({
        from: { name: status.fromName, address: status.fromAddress! },
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(replyTo ? { replyTo } : {}),
        headers: message.tag ? { "X-Opetlife-Tag": message.tag } : undefined,
      });
      return { status: "SENT", messageId: info.messageId ?? null };
    } catch (error) {
      const result = classify(error);
      if (result.status === "FAILED") this.logger.warn(`Email send failed (${result.failureKind} ${result.failureCode})`);
      return result;
    }
  }

  /** Opens and authenticates an SMTP connection without sending anything. */
  async verify(): Promise<{ ok: boolean; message: string | null }> {
    const status = this.status();
    if (!status.live) return { ok: false, message: `Not configured: ${status.missingConfiguration.join(", ")}` };
    try {
      await this.transport().verify();
      return { ok: true, message: null };
    } catch (error) {
      return { ok: false, message: (error as Error).message?.slice(0, 300) ?? "verify failed" };
    }
  }
}
