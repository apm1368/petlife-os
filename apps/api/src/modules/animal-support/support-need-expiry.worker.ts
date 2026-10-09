import { registerWorker, trackWorker } from "../../common/workers/worker-heartbeat";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { SupportNeedService } from "./support-need.service";

/** Expires listings past their deadline and sends one "expiring soon" reminder. Never touches accepted offers or money. */
@Injectable()
export class SupportNeedExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly logger = new Logger(SupportNeedExpiryWorker.name);

  constructor(private readonly needs: SupportNeedService) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== "test") { registerWorker("support-need-expiry", 5 * 60_000); this.timer = setInterval(() => void trackWorker("support-need-expiry", 5 * 60_000, () => this.tick()).catch(() => undefined), 5 * 60_000); }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()) {
    if (this.running) return { expired: 0, warned: 0 };
    this.running = true;
    try {
      return await this.needs.processExpiries(now);
    } catch (error) {
      this.logger.error("Support need expiry tick failed", error instanceof Error ? error.stack : undefined);
      return { expired: 0, warned: 0 };
    } finally {
      this.running = false;
    }
  }
}
