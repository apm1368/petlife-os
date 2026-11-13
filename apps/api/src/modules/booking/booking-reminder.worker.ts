import { registerWorker, trackWorker } from "../../common/workers/worker-heartbeat";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { BookingStatus, NotificationCategory } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";

const HOUR = 3_600_000;
/** Each reminder fires inside its own window before the start; the claim is atomic, so it goes out at most once. */
const WINDOWS = [
  { key: "reminder24hSentAt" as const, type: "booking.reminder_24h", from: 22 * HOUR, to: 24 * HOUR, minLead: 26 * HOUR },
  { key: "reminder2hSentAt" as const, type: "booking.reminder_2h", from: 1.5 * HOUR, to: 2 * HOUR, minLead: 3 * HOUR },
];

function tehranTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Tehran" }).format(date);
}

/**
 * Automatic appointment reminders, 24 hours and 2 hours before every confirmed booking, so owners do not miss
 * visits and providers see fewer no-shows. The reminder links to the booking, where the owner confirms they will
 * attend, reschedules or cancels. A booking made only shortly before its start skips a reminder that would merely
 * repeat the confirmation (it is still marked handled). Delivery is the NotificationOrchestrator: in-app always, SMS
 * only where a real provider is configured and the owner's preferences allow it.
 */
@Injectable()
export class BookingReminderWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly logger = new Logger(BookingReminderWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationOrchestratorService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== "test") {
      registerWorker("booking-reminders", 300_000);
      this.timer = setInterval(() => void trackWorker("booking-reminders", 300_000, () => this.process()).catch((e) => this.logger.error("Booking reminder tick failed", e)), 300_000);
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async process(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let sent = 0;
    try {
      for (const w of WINDOWS) {
        const due = await this.prisma.booking.findMany({
          where: { bookingStatus: BookingStatus.CONFIRMED, [w.key]: null, startAt: { gt: new Date(now.getTime() + w.from), lte: new Date(now.getTime() + w.to) } },
          select: { id: true, createdAt: true, startAt: true },
          orderBy: { startAt: "asc" },
          take: 200,
        });
        for (const b of due) {
          const claimed = await this.prisma.booking.updateMany({ where: { id: b.id, [w.key]: null, bookingStatus: BookingStatus.CONFIRMED }, data: { [w.key]: now } });
          if (!claimed.count) continue;
          if (b.startAt.getTime() - b.createdAt.getTime() < w.minLead) continue; // booked moments ago: no echo of the confirmation
          if (await this.deliver(b.id, w.type)) sent++;
        }
      }
      return sent;
    } finally {
      this.running = false;
    }
  }

  private async deliver(bookingId: string, type: string): Promise<boolean> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { pet: { select: { name: true } }, providerOrganization: { select: { name: true } } },
    });
    if (!booking) return false;
    try {
      await this.notifications.notify({
        userId: booking.userId,
        type,
        category: NotificationCategory.BOOKING,
        petId: booking.petId,
        householdId: booking.householdId,
        deepLink: NotificationDeepLinks.booking(booking.id),
        entityType: "Booking",
        entityId: booking.id,
        actorType: "PROVIDER_ORGANIZATION",
        actorId: booking.providerOrganizationId,
        templateParams: { petName: booking.pet.name, providerName: booking.providerOrganization.name, time: tehranTime(booking.startAt) },
      });
      return true;
    } catch (e) {
      this.logger.warn(`Booking reminder ${type} for ${bookingId} not delivered: ${(e as Error).message}`);
      return false;
    }
  }
}
