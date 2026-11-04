import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { registerWorker, trackWorker } from "../../../common/workers/worker-heartbeat";
import { InventoryReservationService } from "./inventory-reservation.service";

/** Releases the 15-minute payment-start holds (OF-13). */
@Injectable()
export class InventoryReservationExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private readonly logger = new Logger(InventoryReservationExpiryWorker.name);

  constructor(private readonly reservations: InventoryReservationService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    registerWorker("inventory-reservation-expiry", 60_000);
    this.timer = setInterval(() => {
      void trackWorker("inventory-reservation-expiry", 60_000, () => this.process()).catch((error) =>
        this.logger.error("Inventory reservation expiry tick failed", error),
      );
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  process(now = new Date()) {
    return this.reservations.releaseExpired(now);
  }
}
