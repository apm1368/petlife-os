import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { BookingActorType, BookingStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { BookingLifecycleService, bookingEventFields } from "./booking-lifecycle.service";

/**
 * Expires unanswered requests and unpaid bookings once their window passes. Nothing is ever
 * auto-confirmed or auto-charged; expiry only releases capacity and tells the customer.
 */
@Injectable()
export class BookingExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly logger = new Logger(BookingExpiryWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: BookingLifecycleService,
    private readonly events: DomainEventsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== "test") this.timer = setInterval(() => void this.process().catch((e) => this.logger.error("Booking expiry tick failed", e)), 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async process(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const due = await this.prisma.booking.findMany({
        where: { bookingStatus: { in: [BookingStatus.REQUESTED, BookingStatus.AWAITING_PAYMENT] }, requestExpiresAt: { lte: now } },
        select: { id: true, bookingStatus: true },
        take: 200,
      });
      let expired = 0;
      for (const row of due) {
        try {
          await this.prisma.$transaction(async (tx) => {
            const expired = await this.lifecycle.transition(tx, {
              bookingId: row.id,
              to: BookingStatus.EXPIRED,
              from: [row.bookingStatus],
              actorType: BookingActorType.SYSTEM,
              reason: row.bookingStatus === BookingStatus.REQUESTED ? "PROVIDER_DID_NOT_RESPOND" : "PAYMENT_NOT_COMPLETED",
            });
            await this.events.publish("ServiceBookingExpired", { ...bookingEventFields(expired), previousStatus: row.bookingStatus }, { tx, aggregateType: "Booking", aggregateId: row.id });
          });
          expired++;
        } catch (error) {
          // A concurrent accept/payment won the race — that outcome stands.
          this.logger.debug(`Skipped expiry for ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return expired;
    } finally {
      this.running = false;
    }
  }
}
