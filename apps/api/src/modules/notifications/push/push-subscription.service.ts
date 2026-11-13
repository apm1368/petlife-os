import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PushSubscription } from "@prisma/client";
import type { AppEnv } from "../../../config/env";
import { ApiException } from "../../../common/errors/api-exception";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { deviceLabelFromUserAgent, isAllowedPushEndpoint } from "./push-endpoint.util";
import { pushDirection, pushTargetUrl, pushTestTitle } from "./push-payload.util";
import { WebPushService, type PushSendOutcome } from "./web-push.service";

/** A member rarely has more than a phone, a laptop and the Android app; past this the oldest device is dropped. */
export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10;
/** Consecutive non-transient failures after which a subscription is treated as dead. */
export const PUSH_FAILURE_LIMIT = 5;

export interface PushSubscribeInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
}

export interface PushDeviceView {
  id: string;
  deviceLabel: string | null;
  createdAt: Date;
  lastSuccessAt: Date | null;
}

const toView = (row: PushSubscription): PushDeviceView => ({ id: row.id, deviceLabel: row.deviceLabel, createdAt: row.createdAt, lastSuccessAt: row.lastSuccessAt });

@Injectable()
export class PushSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webPush: WebPushService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  publicConfig(): { enabled: boolean; publicKey: string | null } {
    return { enabled: this.webPush.isConfigured(), publicKey: this.webPush.publicKey() };
  }

  async list(userId: string): Promise<{ devices: PushDeviceView[] }> {
    const rows = await this.prisma.pushSubscription.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return { devices: rows.map(toView) };
  }

  /**
   * Opt-in for this browser/app. Upserts by endpoint: one device belongs to whoever subscribed on it last, so a
   * shared computer never keeps delivering the previous member's notifications to the next one.
   */
  async subscribe(userId: string, input: PushSubscribeInput, userAgent: string | undefined): Promise<PushDeviceView> {
    if (!this.webPush.isConfigured()) throw new ApiException("PUSH_NOT_CONFIGURED", "Push notifications are not available yet.", HttpStatus.SERVICE_UNAVAILABLE);
    if (!isAllowedPushEndpoint(input.endpoint)) throw new ApiException("PUSH_ENDPOINT_NOT_ALLOWED", "This browser's push service is not supported.", HttpStatus.BAD_REQUEST);
    const expiresAt = typeof input.expirationTime === "number" && Number.isFinite(input.expirationTime) ? new Date(input.expirationTime) : null;
    const data = { userId, p256dh: input.keys.p256dh, auth: input.keys.auth, deviceLabel: deviceLabelFromUserAgent(userAgent), expiresAt, failureCount: 0, lastFailureAt: null };
    // Moving a device to another member needs the browser's own secret keys, not just its endpoint URL: otherwise
    // anyone who learned an endpoint could take that device's notifications over.
    const existing = await this.prisma.pushSubscription.findUnique({ where: { endpoint: input.endpoint }, select: { userId: true, p256dh: true, auth: true } });
    if (existing && existing.userId !== userId && (existing.auth !== input.keys.auth || existing.p256dh !== input.keys.p256dh)) {
      throw new ApiException("PUSH_SUBSCRIPTION_CONFLICT", "This device is already registered for notifications.", HttpStatus.CONFLICT);
    }
    const row = await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { endpoint: input.endpoint, ...data },
      update: data,
    });
    const surplus = await this.prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      skip: MAX_PUSH_SUBSCRIPTIONS_PER_USER,
      select: { id: true },
    });
    if (surplus.length > 0) await this.prisma.pushSubscription.deleteMany({ where: { id: { in: surplus.map((s) => s.id) } } });
    return toView(row);
  }

  /** Opt-out for one browser (by its endpoint) — only ever the caller's own row. */
  async unsubscribe(userId: string, endpoint: string): Promise<{ removed: number }> {
    const { count } = await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { removed: count };
  }

  /**
   * Remove another of the caller's devices from settings (by id) — only ever the caller's own row. Someone else's
   * id (or an unknown one) is a 404, exactly like a missing row, so ids reveal nothing.
   */
  async remove(userId: string, id: string): Promise<{ removed: number }> {
    const { count } = await this.prisma.pushSubscription.deleteMany({ where: { userId, id } });
    if (count === 0) throw new ApiException("PUSH_DEVICE_NOT_FOUND", "This device is not in your notification devices.", HttpStatus.NOT_FOUND);
    return { removed: count };
  }

  /** "Send a test notification": straight to the caller's device(s), no inbox entry. */
  async sendTest(userId: string, locale: string, endpoint?: string): Promise<{ sent: number; failed: number }> {
    if (!this.webPush.isConfigured()) throw new ApiException("PUSH_NOT_CONFIGURED", "Push notifications are not available yet.", HttpStatus.SERVICE_UNAVAILABLE);
    const rows = await this.prisma.pushSubscription.findMany({ where: { userId, ...(endpoint ? { endpoint } : {}) } });
    if (rows.length === 0) throw new ApiException("PUSH_NOT_SUBSCRIBED", "This device is not subscribed to push notifications.", HttpStatus.NOT_FOUND);
    const url = pushTargetUrl(this.config.get("WEB_APP_ORIGIN", { infer: true }), locale, "/profile/notifications");
    let sent = 0;
    for (const row of rows) {
      const outcome = await this.webPush.send(row, { id: `test-${row.id}`, title: pushTestTitle(locale), url, lang: locale, dir: pushDirection(locale) }, { urgency: "high", ttlSeconds: 300 });
      await this.record(row, outcome);
      if (outcome.status === "SENT") sent += 1;
    }
    return { sent, failed: rows.length - sent };
  }

  /** Keeps a subscription's health current after a send; deletes it once the push service says it is gone. */
  async record(row: Pick<PushSubscription, "id" | "failureCount">, outcome: PushSendOutcome): Promise<void> {
    if (outcome.status === "SENT") {
      await this.prisma.pushSubscription.updateMany({ where: { id: row.id }, data: { lastSuccessAt: new Date(), failureCount: 0 } });
    } else if (outcome.status === "GONE" || (outcome.status === "PERMANENT" && row.failureCount + 1 >= PUSH_FAILURE_LIMIT)) {
      await this.prisma.pushSubscription.deleteMany({ where: { id: row.id } });
    } else {
      await this.prisma.pushSubscription.updateMany({ where: { id: row.id }, data: { lastFailureAt: new Date(), failureCount: { increment: 1 } } });
    }
  }
}
