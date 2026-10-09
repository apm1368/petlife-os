import { registerWorker, trackWorker } from "../../common/workers/worker-heartbeat";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { createHash } from "node:crypto";
import { NotificationCategory, TripStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";

const WINDOW_MS = 3 * 86400e3;
const uuidFrom = (seed: string) => {
  const h = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20)}`;
};

/**
 * Three days before departure, the trip's creator gets one checklist reminder with how many items are still open.
 * Keyed on (trip, departAt) — moving the date re-arms it; repeated ticks never duplicate it.
 */
@Injectable()
export class TripReminderNotifier implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private readonly logger = new Logger(TripReminderNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationOrchestratorService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== "test") { registerWorker("trip-reminders", 3600e3); this.timer = setInterval(() => void trackWorker("trip-reminders", 3600e3, () => this.process()).catch((e) => this.logger.error("Trip reminder tick failed", e)), 3600e3); }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async process(now = new Date()): Promise<number> {
    const trips = await this.prisma.trip.findMany({
      where: { status: { in: [TripStatus.DRAFT, TripStatus.PLANNING, TripStatus.READY] }, departAt: { gt: now, lte: new Date(now.getTime() + WINDOW_MS) } },
      select: { id: true, petId: true, householdId: true, createdByUserId: true, departAt: true, destinationCity: true, destinationCountry: true, pet: { select: { name: true } }, _count: { select: { checklistItems: { where: { done: false } } } } },
      take: 200,
    });
    let sent = 0;
    for (const t of trips) {
      const eventId = uuidFrom(`trip-soon:${t.id}:${t.departAt.toISOString()}`);
      await this.prisma.domainEvent.upsert({ where: { id: eventId }, create: { id: eventId, type: "TripDepartureApproaching", aggregateType: "Pet", aggregateId: t.petId, payload: { tripId: t.id, departAt: t.departAt.toISOString() } }, update: {} });
      const r = await this.notifications.notify({ userId: t.createdByUserId, type: "travel.trip_approaching", category: NotificationCategory.TRAVEL, petId: t.petId, householdId: t.householdId, entityType: "Trip", entityId: t.id, domainEventId: eventId, deepLink: NotificationDeepLinks.trip(t.id), templateParams: { petName: t.pet.name, destination: t.destinationCity ?? t.destinationCountry, open: String(t._count.checklistItems) } });
      if (r.created) sent++;
    }
    return sent;
  }
}
