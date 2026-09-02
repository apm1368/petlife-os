import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MessagingProvider, NotificationDeliveryStatus, NotificationFailureKind, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import type { AppEnv } from "../../config/env";
import { MessagingProviderRegistry } from "./messaging/messaging-provider-registry.service";

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
  ) {}

  /** No-op (returns false) if the row is not currently PENDING/QUEUED — already claimed by a concurrent caller, or already terminal. */
  async attempt(deliveryId: string): Promise<boolean> {
    const claim = await this.prisma.notificationDelivery.updateMany({
      where: { id: deliveryId, status: { in: [NotificationDeliveryStatus.PENDING, NotificationDeliveryStatus.QUEUED] } },
      data: { status: NotificationDeliveryStatus.SENDING, attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
    });
    if (claim.count === 0) return false;

    const delivery = await this.prisma.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    const meta = (delivery.metadata as { destination?: string; smsBody?: string; mode?: "SUCCESS" | "FAILURE_TRANSIENT" | "FAILURE_PERMANENT" | "PENDING" } | null) ?? {};
    if (!meta.destination || !meta.smsBody) {
      await this.markPermanentFailure(deliveryId, "MISSING_DESTINATION_OR_BODY", "The delivery was missing a destination or message body.");
      return true;
    }
    // The dev/test-only simulated mode is consumed exactly once per attempt: used for this call, then always cleared from metadata below regardless of outcome — so a bare retry (no test intervention) always attempts for real (simulated-success in DEV), while a test wanting a second forced failure must explicitly re-set metadata.mode before calling attempt() again.
    const simMode = meta.mode;
    const { mode: _consumedMode, ...metadataWithModeCleared } = meta;
    void _consumedMode;

    try {
      const gateway = this.registry.resolveActiveSmsProvider();
      const result = await gateway.sendSms({ destination: meta.destination, body: meta.smsBody, mode: simMode });

      if (result.status === "SENT") {
        await this.prisma.notificationDelivery.update({
          where: { id: deliveryId },
          data: { status: NotificationDeliveryStatus.SENT, provider: gateway.provider, providerMessageId: result.providerMessageId, failureKind: null, failureCode: null, failureMessage: null, metadata: metadataWithModeCleared },
        });
        await this.events.publish("NotificationDeliverySucceeded", { deliveryId, notificationId: delivery.notificationId, provider: gateway.provider });
        return true;
      }

      if (result.failureKind === "PERMANENT") {
        await this.markPermanentFailure(deliveryId, result.failureCode ?? "PROVIDER_REJECTED", result.failureMessage ?? "The provider rejected this message.", gateway.provider, metadataWithModeCleared);
      } else {
        // delivery.attemptCount already reflects this attempt (the claim above incremented it before this call) — pass it as-is, not +1, or exhaustion would trigger one attempt too early.
        await this.scheduleTransientRetry(deliveryId, delivery.attemptCount, result.failureCode ?? "PROVIDER_TRANSIENT_ERROR", result.failureMessage ?? "The provider reported a transient error.", gateway.provider, metadataWithModeCleared);
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Notification delivery ${deliveryId} threw unexpectedly`, error instanceof Error ? error.stack : undefined);
      await this.scheduleTransientRetry(deliveryId, delivery.attemptCount, "UNEXPECTED_ERROR", message, undefined, metadataWithModeCleared);
      return true;
    }
  }

  private async markPermanentFailure(deliveryId: string, failureCode: string, failureMessage: string, provider?: MessagingProvider, metadata?: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: NotificationDeliveryStatus.FAILED, failedAt: new Date(), failureKind: NotificationFailureKind.PERMANENT, failureCode, failureMessage, ...(provider ? { provider } : {}), ...(metadata ? { metadata } : {}) },
    });
    const delivery = await this.prisma.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    await this.events.publish("NotificationDeliveryFailed", { deliveryId, notificationId: delivery.notificationId, failureKind: "PERMANENT", willRetry: false });
  }

  private async scheduleTransientRetry(deliveryId: string, attemptCount: number, failureCode: string, failureMessage: string, provider?: MessagingProvider, metadata?: Prisma.InputJsonValue): Promise<void> {
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
    await this.events.publish("NotificationDeliveryFailed", { deliveryId, notificationId: delivery.notificationId, failureKind: "TRANSIENT", willRetry: !exhausted });
  }
}
