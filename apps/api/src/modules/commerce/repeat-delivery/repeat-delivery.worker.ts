import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { RepeatDeliveryService } from "./repeat-delivery.service";

/** Sends the "your repeat delivery is due" reminder. It never creates an order and never charges. */
@Injectable()
export class RepeatDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly logger = new Logger(RepeatDeliveryWorker.name);

  constructor(private readonly repeat: RepeatDeliveryService) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== "test") this.timer = setInterval(() => void this.tick(), 15 * 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.repeat.sendDueReminders(now);
    } catch (error) {
      this.logger.error("Repeat delivery reminder tick failed", error instanceof Error ? error.stack : undefined);
      return 0;
    } finally {
      this.running = false;
    }
  }
}
