import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  MessagingProvider,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationFailureKind,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import type { AppEnv } from "../../config/env";
import { MessagingProviderRegistry } from "./messaging/messaging-provider-registry.service";
import { EmailGatewayService } from "../../common/email/email-gateway.service";
import { publicOrigin, renderEmail, type EmailLocale } from "../../common/email/email-layout";
import { WebPushService, type PushPayload, type PushSendOutcome } from "./push/web-push.service";
import { PushSubscriptionService } from "./push/push-subscription.service";

interface PushDeliveryMeta {
  userId?: string;
  /** Category-level title (pushTitle); the notification's own title/body never goes into a push. */
  title?: string;
  url?: string;
  locale?: string;
  dir?: "rtl" | "ltr";
  silent?: boolean;
  urgency?: "high" | "normal";
  /** Subscription ids already reached by an earlier attempt; a retry never sends to them twice. */
  sentTo?: string[];
}

/** Exponential backoff, capped — 30s, 60s, 120s, ... never a wait so long a bounded-attempt policy feels indefinite. */
function backoffSeconds(attemptCount: number): number {
  return Math.min(30 * 2 ** Math.max(0, attemptCount - 1), 15 * 60);
}

/**
 * The one place a non-IN_APP NotificationDelivery ever gets attempted.
 * Claims the row atomically before touching any external provider (the
 * exact same "claim via the DB, then call the provider" discipline
 * ShippingOrchestrator's requestCourier and MarketplaceOrderIngestionService
 * already established) — two concurrent calls for the same delivery id can
 * never both reach the gateway, satisfying the spec's "same delivery worker
 * invoked concurrently -> exactly one logical SMS send claim" requirement
 * without relying on any timing assumption.
 */
@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: MessagingProviderRegistry,
    private readonly events: DomainEventsService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly email: EmailGatewayService,
    private readonly webPush: WebPushService,
    private readonly pushSubscriptions: PushSubscriptionService,
  ) {}

  /** No-op (returns false) if the row is not currently PENDING/QUEUED — already claimed by a concurrent caller, or already terminal. */
  async attempt(deliveryId: string): Promise<boolean> {
    const claim = await this.prisma.notificationDelivery.updateMany({
      where: {
        id: deliveryId,
        status: { in: [NotificationDeliveryStatus.PENDING, NotificationDeliveryStatus.QUEUED] },
      },
      data: {
        status: NotificationDeliveryStatus.SENDING,
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
    if (claim.count === 0) return false;

    const delivery = await this.prisma.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    if (delivery.channel === NotificationChannel.EMAIL) return this.attemptEmail(delivery);
    if (delivery.channel === NotificationChannel.PUSH) return this.attemptPush(delivery);
    const meta =
      (delivery.metadata as {
        destination?: string;
        smsBody?: string;
        templateKey?: string;
        locale?: "fa" | "en";
        mode?: "SUCCESS" | "FAILURE_TRANSIENT" | "FAILURE_PERMANENT" | "PENDING";
      } | null) ?? {};
    if (!meta.destination || !meta.smsBody) {
      await this.markPermanentFailure(
        deliveryId,
        "MISSING_DESTINATION_OR_BODY",
        "The delivery was missing a destination or message body.",
      );
      return true;
    }
    // The dev/test-only simulated mode is consumed exactly once per attempt: used for this call, then always cleared from metadata below regardless of outcome — so a bare retry (no test intervention) always attempts for real (simulated-success in DEV), while a test wanting a second forced failure must explicitly re-set metadata.mode before calling attempt() again.
    const simMode = meta.mode;
    const { mode: _consumedMode, ...metadataWithModeCleared } = meta;
    void _consumedMode;

    try {
      const gateway = this.registry.resolveActiveSmsProvider();
      const result = await gateway.sendSms({
        destination: meta.destination,
        body: meta.smsBody,
        templateKey: meta.templateKey,
        locale: meta.locale,
        mode: simMode,
      });

      if (result.status === "SENT") {
        await this.prisma.notificationDelivery.update({
          where: { id: deliveryId },
          data: {
            status: NotificationDeliveryStatus.SENT,
            provider: gateway.provider,
            providerMessageId: result.providerMessageId,
            failureKind: null,
            failureCode: null,
            failureMessage: null,
            metadata: metadataWithModeCleared,
          },
        });
        await this.events.publish("NotificationDeliverySucceeded", {
          deliveryId,
          notificationId: delivery.notificationId,
          provider: gateway.provider,
        });
        return true;
      }

      if (result.failureKind === "PERMANENT") {
        await this.markPermanentFailure(
          deliveryId,
          result.failureCode ?? "PROVIDER_REJECTED",
          result.failureMessage ?? "The provider rejected this message.",
          gateway.provider,
          metadataWithModeCleared,
        );
      } else {
        // delivery.attemptCount already reflects this attempt (the claim above incremented it before this call) — pass it as-is, not +1, or exhaustion would trigger one attempt too early.
        await this.scheduleTransientRetry(
          deliveryId,
          delivery.attemptCount,
          result.failureCode ?? "PROVIDER_TRANSIENT_ERROR",
          result.failureMessage ?? "The provider reported a transient error.",
          gateway.provider,
          metadataWithModeCleared,
        );
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Notification delivery ${deliveryId} threw unexpectedly`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.scheduleTransientRetry(
        deliveryId,
        delivery.attemptCount,
        "UNEXPECTED_ERROR",
        message,
        undefined,
        metadataWithModeCleared,
      );
      return true;
    }
  }

  /** Email twin of the SMS path: same claim, same retry/backoff and failure bookkeeping, different gateway. */
  private async attemptEmail(delivery: { id: string; notificationId: string; attemptCount: number; metadata: Prisma.JsonValue }): Promise<boolean> {
    const meta = (delivery.metadata as { destination?: string; title?: string; body?: string; locale?: EmailLocale; deepLink?: string | null; actionLabel?: string; templateKey?: string } | null) ?? {};
    if (!meta.destination || !meta.title) {
      await this.markPermanentFailure(delivery.id, "MISSING_DESTINATION_OR_BODY", "The delivery was missing a destination or message body.");
      return true;
    }
    const provider = this.emailProvider();
    try {
      const locale = meta.locale ?? "en";
      const origin = publicOrigin(this.config.get("WEB_APP_ORIGIN", { infer: true }));
      const action = meta.deepLink ? { label: meta.actionLabel ?? "opetlife", url: meta.deepLink.startsWith("http") ? meta.deepLink : `${origin}/${locale}${meta.deepLink.startsWith("/") ? "" : "/"}${meta.deepLink}` } : null;
      const { html, text } = renderEmail({ locale, title: meta.title, body: meta.body ?? "", action });
      const result = await this.email.send({ to: meta.destination, subject: meta.title, html, text, tag: meta.templateKey });
      if (result.status === "SENT") {
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: { status: NotificationDeliveryStatus.SENT, provider, providerMessageId: result.messageId, failureKind: null, failureCode: null, failureMessage: null },
        });
        await this.events.publish("NotificationDeliverySucceeded", { deliveryId: delivery.id, notificationId: delivery.notificationId, provider });
      } else if (result.failureKind === "PERMANENT") {
        await this.markPermanentFailure(delivery.id, result.failureCode, result.failureMessage, provider);
      } else {
        await this.scheduleTransientRetry(delivery.id, delivery.attemptCount, result.failureCode, result.failureMessage, provider);
      }
    } catch (error) {
      this.logger.error(`Email delivery ${delivery.id} threw unexpectedly`, error instanceof Error ? error.stack : undefined);
      await this.scheduleTransientRetry(delivery.id, delivery.attemptCount, "UNEXPECTED_ERROR", error instanceof Error ? error.message : String(error), provider);
    }
    return true;
  }

  /**
   * Push twin of the SMS/email paths: one delivery row covers all of the member's devices. Each device's outcome
   * updates its subscription (a gone endpoint is deleted). Devices still failing transiently are retried with the
   * same backoff and attempt budget; a device already reached is never sent to again. SENT once any device got it.
   */
  private async attemptPush(delivery: { id: string; notificationId: string; attemptCount: number; metadata: Prisma.JsonValue }): Promise<boolean> {
    const meta = (delivery.metadata as PushDeliveryMeta | null) ?? {};
    if (!meta.userId || !meta.title || !meta.url) {
      await this.markPermanentFailure(delivery.id, "MISSING_DESTINATION_OR_BODY", "The delivery was missing a recipient, title or link.");
      return true;
    }
    const provider = MessagingProvider.WEB_PUSH;
    try {
      const sentTo = new Set(meta.sentTo ?? []);
      const devices = await this.prisma.pushSubscription.findMany({ where: { userId: meta.userId } });
      const payload: PushPayload = {
        id: delivery.notificationId,
        title: meta.title,
        url: meta.url,
        lang: meta.locale ?? "fa",
        dir: meta.dir ?? "rtl",
        silent: meta.silent ?? false,
      };
      let transient: Extract<PushSendOutcome, { status: "TRANSIENT" }> | null = null;
      let rejected: Extract<PushSendOutcome, { status: "PERMANENT" | "GONE" }> | null = null;
      for (const device of devices.filter((d) => !sentTo.has(d.id))) {
        const outcome = await this.webPush.send(device, payload, { urgency: meta.urgency ?? "normal" });
        await this.pushSubscriptions.record(device, outcome);
        if (outcome.status === "SENT") sentTo.add(device.id);
        else if (outcome.status === "TRANSIENT") transient = outcome;
        else rejected = outcome;
      }
      const metadata = { ...meta, sentTo: [...sentTo] } as Prisma.InputJsonValue;
      const maxAttempts = this.config.get("NOTIFICATION_MAX_DELIVERY_ATTEMPTS", { infer: true });
      if (transient && (sentTo.size === 0 || delivery.attemptCount < maxAttempts)) {
        await this.scheduleTransientRetry(delivery.id, delivery.attemptCount, transient.code, transient.message, provider, metadata);
      } else if (sentTo.size > 0) {
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: NotificationDeliveryStatus.SENT,
            provider,
            destinationMasked: `${sentTo.size} device${sentTo.size === 1 ? "" : "s"}`,
            failureKind: null,
            failureCode: null,
            failureMessage: null,
            metadata,
          },
        });
        await this.events.publish("NotificationDeliverySucceeded", { deliveryId: delivery.id, notificationId: delivery.notificationId, provider });
      } else if (devices.length === 0 || rejected?.status === "GONE") {
        await this.markPermanentFailure(delivery.id, rejected?.code ?? "NO_PUSH_SUBSCRIPTION", "No subscribed device could receive this notification.", provider, metadata);
      } else {
        await this.markPermanentFailure(delivery.id, rejected?.code ?? "PUSH_REJECTED", rejected && "message" in rejected ? rejected.message : "The push service rejected this message.", provider, metadata);
      }
    } catch (error) {
      this.logger.error(`Push delivery ${delivery.id} threw unexpectedly`, error instanceof Error ? error.stack : undefined);
      await this.scheduleTransientRetry(delivery.id, delivery.attemptCount, "UNEXPECTED_ERROR", error instanceof Error ? error.message : String(error), provider);
    }
    return true;
  }

  private emailProvider(): MessagingProvider {
    const name = this.email.status().provider;
    return name === "gmail" ? MessagingProvider.GMAIL : name === "smtp" ? MessagingProvider.SMTP : MessagingProvider.DEV;
  }

  private async markPermanentFailure(
    deliveryId: string,
    failureCode: string,
    failureMessage: string,
    provider?: MessagingProvider,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: NotificationDeliveryStatus.FAILED,
        failedAt: new Date(),
        failureKind: NotificationFailureKind.PERMANENT,
        failureCode,
        failureMessage,
        ...(provider ? { provider } : {}),
        ...(metadata ? { metadata } : {}),
      },
    });
    const delivery = await this.prisma.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    await this.events.publish("NotificationDeliveryFailed", {
      deliveryId,
      notificationId: delivery.notificationId,
      failureKind: "PERMANENT",
      willRetry: false,
    });
  }

  private async scheduleTransientRetry(
    deliveryId: string,
    attemptCount: number,
    failureCode: string,
    failureMessage: string,
    provider?: MessagingProvider,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    const maxAttempts = this.config.get("NOTIFICATION_MAX_DELIVERY_ATTEMPTS", { infer: true });
    const exhausted = attemptCount >= maxAttempts;
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: exhausted ? NotificationDeliveryStatus.FAILED : NotificationDeliveryStatus.QUEUED,
        failedAt: exhausted ? new Date() : null,
        scheduledAt: exhausted ? null : new Date(Date.now() + backoffSeconds(attemptCount) * 1000),
        failureKind: NotificationFailureKind.TRANSIENT,
        failureCode,
        failureMessage,
        ...(provider ? { provider } : {}),
        ...(metadata ? { metadata } : {}),
      },
    });
    const delivery = await this.prisma.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    await this.events.publish("NotificationDeliveryFailed", {
      deliveryId,
      notificationId: delivery.notificationId,
      failureKind: "TRANSIENT",
      willRetry: !exhausted,
    });
  }
}
