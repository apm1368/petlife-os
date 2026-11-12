import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NotificationChannel, NotificationDeliveryStatus, Prisma } from "@prisma/client";
import type { AppEnv } from "../../../config/env";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ApiException } from "../../../common/errors/api-exception";
import { getCountryConfig } from "../../../common/country/country-config";
import { maskPhone } from "../../../common/phone/phone-normalizer";
import { maskEmail } from "../../../common/pii/pii-mask.util";
import { EmailGatewayService } from "../../../common/email/email-gateway.service";
import { renderEmail, type EmailLocale } from "../../../common/email/email-layout";
import { MessagingProviderRegistry } from "../../notifications/messaging/messaging-provider-registry.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

const mask = (value: string | undefined | null) => (value ? `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}` : null);

const TEST_EMAIL: Record<EmailLocale, { subject: string; body: string }> = {
  fa: { subject: "پیام آزمایشی اپت‌لایف", body: "این یک پیام آزمایشی از پنل مدیریت است. اگر آن را می‌بینید، ارسال ایمیل درست کار می‌کند." },
  en: { subject: "opetlife test message", body: "This is a test message from the admin panel. If you can read it, email delivery works." },
  de: { subject: "opetlife-Testnachricht", body: "Dies ist eine Testnachricht aus dem Admin-Bereich. Wenn Sie sie lesen können, funktioniert der E-Mail-Versand." },
  es: { subject: "Mensaje de prueba de opetlife", body: "Este es un mensaje de prueba del panel de administración. Si puedes leerlo, el envío de correo funciona." },
};

/**
 * Messaging console: what is configured (never the secrets themselves), what was sent, and audited test sends.
 * Real SMS/email credentials stay in the server environment; this service only reports their presence.
 */
@Injectable()
export class AdminMessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly email: EmailGatewayService,
    private readonly registry: MessagingProviderRegistry,
    private readonly audit: AdminAuditLogService,
  ) {}

  async status() {
    const e = <K extends keyof AppEnv>(key: K) => this.config.get(key, { infer: true }) as AppEnv[K];
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [bindings, stats, lastSms, lastEmail] = await Promise.all([
      this.prisma.smsPatternTemplate.count({ where: { isActive: true } }),
      this.prisma.$queryRaw<{ channel: string; status: string; c: bigint }[]>(Prisma.sql`
        SELECT channel::text AS channel, status::text AS status, COUNT(*) AS c FROM notification_deliveries
        WHERE "createdAt" >= ${since} AND channel::text <> 'IN_APP' GROUP BY 1, 2`),
      this.prisma.notificationDelivery.findFirst({ where: { channel: NotificationChannel.SMS, status: NotificationDeliveryStatus.SENT }, orderBy: { lastAttemptAt: "desc" }, select: { lastAttemptAt: true } }),
      this.prisma.notificationDelivery.findFirst({ where: { channel: NotificationChannel.EMAIL, status: NotificationDeliveryStatus.SENT }, orderBy: { lastAttemptAt: "desc" }, select: { lastAttemptAt: true } }),
    ]);
    // The setup checklist follows whichever real SMS provider is chosen for notifications or sign-in codes.
    const kavenegar = e("MESSAGING_PROVIDER") === "kavenegar" || e("OTP_PROVIDER") === "kavenegar";
    const smsMissing = (
      kavenegar
        ? [
            !e("KAVENEGAR_ENABLED") && "KAVENEGAR_ENABLED=true",
            !e("KAVENEGAR_API_KEY") && "KAVENEGAR_API_KEY",
            // A sender line is needed for notifications and for plain-text codes (the account has no default line).
            !e("KAVENEGAR_SENDER") && (e("MESSAGING_PROVIDER") === "kavenegar" || !e("KAVENEGAR_OTP_TEMPLATE")) && "KAVENEGAR_SENDER",
          ]
        : [
            !e("FARAZ_SMS_API_KEY") && "FARAZ_SMS_API_KEY",
            !e("FARAZ_SMS_SENDER") && "FARAZ_SMS_SENDER",
            !e("FARAZ_SMS_NOTIFICATION_PATTERN_CODE") && "FARAZ_SMS_NOTIFICATION_PATTERN_CODE",
            !e("FARAZ_SMS_OTP_PATTERN_CODE") && "FARAZ_SMS_OTP_PATTERN_CODE",
          ]
    ).filter((x): x is string => Boolean(x));
    const smsLive = (e("MESSAGING_PROVIDER") === "faraz" || e("MESSAGING_PROVIDER") === "kavenegar") && e("MESSAGING_SANDBOX_MODE") === "production";
    const emailStatus = this.email.status();
    return {
      checkedAt: new Date().toISOString(),
      sms: {
        provider: e("MESSAGING_PROVIDER"),
        mode: e("MESSAGING_SANDBOX_MODE"),
        otpProvider: e("OTP_PROVIDER"),
        live: smsLive,
        otpLive: e("OTP_PROVIDER") === "faraz" || e("OTP_PROVIDER") === "kavenegar",
        setupProvider: kavenegar ? ("kavenegar" as const) : ("faraz" as const),
        senderMasked: mask(kavenegar ? e("KAVENEGAR_SENDER") : e("FARAZ_SMS_SENDER")),
        apiKeyConfigured: Boolean(kavenegar ? e("KAVENEGAR_API_KEY") : e("FARAZ_SMS_API_KEY")),
        // Kavenegar sends codes through a Verify template when one is set, else as plain text from the sender line.
        otpPatternConfigured: kavenegar ? Boolean(e("KAVENEGAR_OTP_TEMPLATE") || e("KAVENEGAR_SENDER")) : Boolean(e("FARAZ_SMS_OTP_PATTERN_CODE")),
        // Kavenegar notifications are plain text and need no pattern.
        notificationPatternConfigured: kavenegar ? true : Boolean(e("FARAZ_SMS_NOTIFICATION_PATTERN_CODE")),
        activePatternBindings: bindings,
        missingConfiguration: smsMissing,
        lastSentAt: lastSms?.lastAttemptAt?.toISOString() ?? null,
      },
      email: {
        ...emailStatus,
        fromAddress: emailStatus.fromAddress ? maskEmail(emailStatus.fromAddress) : null,
        lastSentAt: lastEmail?.lastAttemptAt?.toISOString() ?? null,
      },
      last7Days: stats.map((r) => ({ channel: r.channel, status: r.status, count: Number(r.c) })),
    };
  }

  async deliveries(query: { channel?: "SMS" | "EMAIL"; status?: NotificationDeliveryStatus; page?: number; pageSize?: number }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);
    const where: Prisma.NotificationDeliveryWhereInput = {
      channel: query.channel ? NotificationChannel[query.channel] : { not: NotificationChannel.IN_APP },
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.notificationDelivery.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, channel: true, status: true, provider: true, destinationMasked: true, attemptCount: true, failureKind: true, failureCode: true, failureMessage: true, createdAt: true, lastAttemptAt: true, metadata: true, notification: { select: { type: true, userId: true } } },
      }),
      this.prisma.notificationDelivery.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        channel: r.channel,
        status: r.status,
        provider: r.provider,
        destinationMasked: r.destinationMasked,
        templateKey: r.notification?.type ?? null,
        userId: r.notification?.userId ?? null,
        attemptCount: r.attemptCount,
        failureKind: r.failureKind,
        failureCode: r.failureCode,
        failureMessage: r.failureMessage,
        skipReason: r.status === NotificationDeliveryStatus.SKIPPED ? ((r.metadata as { reason?: string } | null)?.reason ?? null) : null,
        createdAt: r.createdAt.toISOString(),
        lastAttemptAt: r.lastAttemptAt?.toISOString() ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async testSms(admin: ResolvedAdminContext, phone: string, requestId?: string) {
    const normalized = getCountryConfig().normalizePhone(phone);
    if (!normalized) throw new ApiException("PHONE_INVALID", "Enter a valid mobile number.");
    const gateway = this.registry.resolveActiveSmsProvider();
    const result = await gateway.sendSms({ destination: normalized.e164, body: "opetlife: پیام آزمایشی پنل مدیریت / admin test message", templateKey: "admin.message", locale: "fa" });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "messaging.test_sms_sent", entityType: "MESSAGING", entityId: admin.adminUserId, afterSummary: { destination: maskPhone(normalized.e164), provider: gateway.provider, status: result.status, failureCode: result.failureCode ?? null }, requestId });
    return { status: result.status, provider: gateway.provider, failureCode: result.failureCode ?? null, failureMessage: result.failureMessage ?? null };
  }

  async testEmail(admin: ResolvedAdminContext, to: string, locale: EmailLocale, requestId?: string) {
    const copy = TEST_EMAIL[locale];
    const { html, text } = renderEmail({ locale, title: copy.subject, body: copy.body, action: null });
    const result = await this.email.send({ to, subject: copy.subject, html, text, tag: "admin.test" });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "messaging.test_email_sent", entityType: "MESSAGING", entityId: admin.adminUserId, afterSummary: { destination: maskEmail(to), provider: this.email.status().provider, status: result.status, failureCode: result.status === "FAILED" ? result.failureCode : null }, requestId });
    return result.status === "SENT" ? { status: "SENT" as const, failureCode: null, failureMessage: null } : { status: "FAILED" as const, failureCode: result.failureCode, failureMessage: result.failureMessage };
  }

  verifyEmail() {
    return this.email.verify();
  }
}
