import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NotificationChannel, NotificationDeliveryStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AppEnv } from "../../config/env";
import { NotificationDeliveryService } from "./notification-delivery.service";

/**
 * The smallest reliable mechanism compatible with this modular monolith
 * (spec: "do not introduce Kafka/RabbitMQ just for H10... PostgreSQL +
 * existing infrastructure is enough"). A plain `setInterval` poller, not a
 * new dependency (`@nestjs/schedule` is not installed) — picks up two kinds
 * of due rows: a quiet-hours-deferred send whose `scheduledAt` has arrived,
 * and a transiently-failed send whose backoff window has elapsed. Never
 * runs under `NODE_ENV=test` — tests call `processDueDeliveries()` directly
 * for determinism, the same "dev/test drives the real pipeline synchronously"
 * convention every DEV adapter's simulate route already uses.
 *
 * Processing guarantee: at-least-once per due row per tick. Two workers (or
 * two overlapping ticks) racing the same row can never both send it —
 * `NotificationDeliveryService.attempt()` claims the row via an atomic
 * `updateMany` before calling any provider, so a lost race is simply a
 * no-op, never a duplicate send.
 */
@Injectable()
export class NotificationDeliveryWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDeliveryWorkerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: NotificationDeliveryService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    const intervalMs = this.config.get("NOTIFICATION_WORKER_INTERVAL_MS", { infer: true });
    this.timer = setInterval(() => {
      this.processDueDeliveries().catch((error) => this.logger.error("Notification delivery worker tick failed", error instanceof Error ? error.stack : undefined));
    }, intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Returns the number of due rows it attempted (not necessarily sent) — used by dev routes and tests to assert real progress was made. */
  async processDueDeliveries(limit = 50): Promise<number> {
    const due = await this.prisma.notificationDelivery.findMany({
      where: {
        channel: { not: NotificationChannel.IN_APP },
        status: { in: [NotificationDeliveryStatus.PENDING, NotificationDeliveryStatus.QUEUED] },
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      },
      take: limit,
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    for (const row of due) {
      await this.delivery.attempt(row.id);
    }
    return due.length;
  }
}
