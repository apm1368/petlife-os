import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { TravelBookingService } from "./travel-booking.service";

/** Releases lapsed holds, unanswered requests and unpaid bookings; completes finished stays. Never confirms or charges. */
@Injectable()
export class TravelExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly logger = new Logger(TravelExpiryWorker.name);

  constructor(private readonly bookings: TravelBookingService) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== "test") this.timer = setInterval(() => void this.tick(), 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()) {
    if (this.running) return { expired: 0, completed: 0 };
    this.running = true;
    try {
      return await this.bookings.processExpiries(now);
    } catch (error) {
      this.logger.error("Travel expiry tick failed", error instanceof Error ? error.stack : undefined);
      return { expired: 0, completed: 0 };
    } finally {
      this.running = false;
    }
  }
}
