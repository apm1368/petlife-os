import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import { SmsProviderException } from "../../../common/errors/api-exception";
import { FarazSmsClient, FarazSmsError, type FarazPatternInput } from "../../notifications/messaging/faraz-sms.client";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

/**
 * Admin view onto the FarazSMS account: configuration status, balance, and pattern (template)
 * management. Patterns live in FarazSMS, not in our database; every change is audited here.
 */
@Injectable()
export class AdminSmsService {
  constructor(
    private readonly faraz: FarazSmsClient,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly audit: AdminAuditLogService,
  ) {}

  async overview() {
    const configured = this.faraz.isConfigured();
    let balance: { balanceAmount: number; balanceCount: number } | null = null;
    let balanceError: string | null = null;
    if (configured) {
      try {
        balance = await this.faraz.getBalance();
      } catch (error) {
        balanceError = error instanceof Error ? error.message : String(error);
      }
    }
    return {
      configured,
      sender: this.faraz.sender() ?? null,
      otpProvider: this.config.get("OTP_PROVIDER", { infer: true }),
      otpPatternCode: this.config.get("FARAZ_SMS_OTP_PATTERN_CODE", { infer: true }) ?? null,
      otpPatternVar: this.config.get("FARAZ_SMS_OTP_PATTERN_VAR", { infer: true }),
      messagingProvider: this.config.get("MESSAGING_PROVIDER", { infer: true }),
      messagingMode: this.config.get("MESSAGING_SANDBOX_MODE", { infer: true }),
      balance,
      balanceError,
    };
  }

  listPatterns() {
    return this.call(() => this.faraz.listPatterns());
  }

  getPattern(code: string) {
    return this.call(() => this.faraz.getPattern(code));
  }

  lines() {
    return this.call(() => this.faraz.getAccessibleLines());
  }

  async createPattern(actor: ResolvedAdminContext, input: FarazPatternInput) {
    const result = await this.call(() => this.faraz.createPattern(input));
    await this.audit.record({ adminUserId: actor.adminUserId, action: "sms.pattern_created", entityType: "SmsPattern", entityId: typeof result === "string" ? result : "faraz", afterSummary: { text: input.text, category: input.category, vars: input.vars } });
    return { result };
  }

  async deletePattern(actor: ResolvedAdminContext, code: string) {
    await this.call(() => this.faraz.deletePattern(code));
    await this.audit.record({ adminUserId: actor.adminUserId, action: "sms.pattern_deleted", entityType: "SmsPattern", entityId: code });
    return { ok: true as const };
  }

  async testSend(actor: ResolvedAdminContext, input: { code: string; recipient: string; attributes: Record<string, string> }) {
    const requestId = await this.call(() => this.faraz.sendPattern(input));
    await this.audit.record({ adminUserId: actor.adminUserId, action: "sms.pattern_test_sent", entityType: "SmsPattern", entityId: input.code, afterSummary: { requestId } });
    return { requestId };
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof FarazSmsError) throw new SmsProviderException({ httpStatus: error.httpStatus, messages: error.providerMessages.length ? error.providerMessages : [error.message] });
      throw error;
    }
  }
}
