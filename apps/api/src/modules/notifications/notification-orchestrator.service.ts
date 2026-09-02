import { Injectable } from "@nestjs/common";
import { NotificationCategory, NotificationChannel, NotificationDeliveryStatus, NotificationPriority, Prisma, type Notification } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { getCountryConfig } from "../../common/country/country-config";
import { maskPhone } from "../../common/phone/phone-normalizer";
import { NotificationPreferenceService } from "./notification-preference.service";
import { NotificationDeliveryService } from "./notification-delivery.service";
import { renderNotificationTemplate } from "./notification-templates";
import { isWithinQuietHours, nextQuietHoursEndUtc } from "./notification-quiet-hours.util";

export interface NotifyInput {
  userId: string;
  /** The template key, e.g. "booking.confirmed" — also the notification's own `type` field. */
  type: string;
  category: NotificationCategory;
  priority?: NotificationPriority;
  templateParams?: Record<string, string | number>;
  deepLink?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actorType?: string | null;
  actorId?: string | null;
  householdId?: string | null;
  petId?: string | null;
  sellerOrganizationId?: string | null;
  /** The originating DomainEvent.id — the idempotency anchor. Omit only for a notification with no originating domain event (e.g. a dev/manual one); such notifications never dedupe against each other. */
  domainEventId?: string | null;
  metadata?: Record<string, unknown>;
  /** Attempt SMS in addition to IN_APP when the resolved template has an smsBody and preferences/quiet-hours allow it. Default true. */
  attemptSms?: boolean;
  /** Dev/test-only outcome selector for the SMS channel's very first send attempt (see DevMessagingAdapter) — never present in a real domain-event listener call. A retry never reuses this; it always attempts for real (simulated-success in DEV). */
  smsSimMode?: "SUCCESS" | "FAILURE_TRANSIENT" | "FAILURE_PERMANENT" | "PENDING";
}

/**
 * The single write path for creating a user-visible notification and
 * fanning it out to every eligible channel — mirrors the "domain event ->
 * notification decision -> preferences -> template -> channel delivery"
 * pipeline the spec requires. Every domain-event listener in this module
 * calls only this method; none ever touches Prisma's `notification`/
 * `notificationDelivery` tables directly.
 *
 * Idempotency: the Notification row is claimed via a plain (non-
 * transactional) `create()` first, exactly like MarketplaceOrderIngestion-
 * Service's own two-phase pattern (Handoff 09) — a P2002 on
 * `@@unique([domainEventId, type, userId])` is caught cleanly here, with no
 * ambient transaction to poison, and the existing row is returned instead
 * with `created: false`. Callers must never re-run the delivery fan-out for
 * an already-existing notification — this method enforces that by simply
 * returning early.
 */
@Injectable()
export class NotificationOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly preferences: NotificationPreferenceService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  async notify(input: NotifyInput): Promise<{ notification: Notification; created: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
    const rendered = renderNotificationTemplate(input.type, user.locale, input.templateParams ?? {});
    const domainEventId = input.domainEventId ?? null;

    let notification: Notification;
    let created = true;
    try {
      notification = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          householdId: input.householdId ?? null,
          petId: input.petId ?? null,
          sellerOrganizationId: input.sellerOrganizationId ?? null,
          domainEventId,
          type: input.type,
          category: input.category,
          priority: input.priority ?? NotificationPriority.NORMAL,
          title: rendered.title,
          body: rendered.body,
          locale: user.locale,
          deepLink: input.deepLink ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          actorType: input.actorType ?? null,
          actorId: input.actorId ?? null,
          metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      created = false;
      // A P2002 here can only happen when domainEventId was non-null — Postgres treats every NULL as
      // distinct in a unique index, so two domainEventId-less inserts can never collide in the first
      // place. The non-null assertion is therefore safe, not a cast around a real possibility of null.
      notification = await this.prisma.notification.findUniqueOrThrow({
        where: { domainEventId_type_userId: { domainEventId: domainEventId!, type: input.type, userId: input.userId } },
      });
    }

    // Already fully processed by an earlier delivery of the same domain event — never re-fan-out (spec: "process same event twice -> one logical notification -> no duplicate SMS").
    if (!created) return { notification, created };

    await this.prisma.notificationDelivery.create({
      data: { notificationId: notification.id, channel: NotificationChannel.IN_APP, status: NotificationDeliveryStatus.DELIVERED, deliveredAt: new Date() },
    });

    await this.events.publish("NotificationCreated", { notificationId: notification.id, userId: input.userId, type: input.type, category: input.category });

    if (rendered.smsBody && input.attemptSms !== false) {
      await this.fanOutSms(notification.id, input.userId, user.phone, input.category, input.priority ?? NotificationPriority.NORMAL, rendered.smsBody, input.smsSimMode);
    }

    return { notification, created };
  }

  private async fanOutSms(notificationId: string, userId: string, phone: string | null, category: NotificationCategory, priority: NotificationPriority, smsBody: string, smsSimMode?: NotifyInput["smsSimMode"]): Promise<void> {
    const normalized = phone ? getCountryConfig().normalizePhone(phone) : null;
    if (!normalized) {
      await this.prisma.notificationDelivery.create({ data: { notificationId, channel: NotificationChannel.SMS, status: NotificationDeliveryStatus.SKIPPED, metadata: { reason: "no_valid_phone" } } });
      return;
    }

    const enabled = await this.preferences.resolve(userId, category, NotificationChannel.SMS);
    if (!enabled) {
      await this.prisma.notificationDelivery.create({
        data: { notificationId, channel: NotificationChannel.SMS, status: NotificationDeliveryStatus.SKIPPED, destinationMasked: maskPhone(normalized.e164), metadata: { reason: "category_disabled" } },
      });
      return;
    }

    const quietHours = await this.prisma.notificationQuietHours.findUnique({ where: { userId } });
    const now = new Date();
    // URGENT is the one explicit "bypass quiet hours" signal (spec: "high-priority transactional messages may bypass quiet hours only where explicitly permitted") — callers must deliberately pass NotificationPriority.URGENT, never inferred from category.
    if (quietHours?.enabled && priority !== NotificationPriority.URGENT && isWithinQuietHours(now, quietHours.startTime, quietHours.endTime, quietHours.timezone)) {
      await this.prisma.notificationDelivery.create({
        data: {
          notificationId,
          channel: NotificationChannel.SMS,
          status: NotificationDeliveryStatus.QUEUED,
          scheduledAt: nextQuietHoursEndUtc(now, quietHours.endTime, quietHours.timezone),
          destinationMasked: maskPhone(normalized.e164),
          metadata: { destination: normalized.e164, smsBody, reason: "quiet_hours_deferred" },
        },
      });
      return;
    }

    const delivery = await this.prisma.notificationDelivery.create({
      data: { notificationId, channel: NotificationChannel.SMS, status: NotificationDeliveryStatus.PENDING, destinationMasked: maskPhone(normalized.e164), metadata: { destination: normalized.e164, smsBody, mode: smsSimMode } },
    });
    await this.delivery.attempt(delivery.id);
  }
}
