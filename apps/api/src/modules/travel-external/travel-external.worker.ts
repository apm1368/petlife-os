import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ExternalAutomationStatus, ExternalSourceMode, ExternalSyncKind } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { registerWorker, trackWorker } from "../../common/workers/worker-heartbeat";
import { TravelExternalService } from "./travel-external.service";

const TICK_MS = 10 * 60e3;

/** Every 10 min: abandon stuck runs; start a FULL sync for each AUTOMATED+SUPPORTED source whose interval (+ jitter) elapsed and whose circuit is closed. */
@Injectable()
export class TravelExternalWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TravelExternalWorker.name);
  private timer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, private readonly core: TravelExternalService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    registerWorker("travel-external-sync", TICK_MS);
    this.timer = setInterval(() => void trackWorker("travel-external-sync", TICK_MS, () => this.tick()).catch((e) => this.logger.error("Travel external tick failed", e)), TICK_MS);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick(now = new Date()) {
    await this.core.abandonStuckRuns(now);
    const due = await this.prisma.externalTravelSource.findMany({ where: { mode: ExternalSourceMode.AUTOMATED, automationStatus: ExternalAutomationStatus.SUPPORTED, OR: [{ circuitOpenUntil: null }, { circuitOpenUntil: { lt: now } }] } });
    for (const s of due) {
      const jitter = (parseInt(s.id.slice(0, 4), 16) % 10) * 60e3;
      if (s.lastRunAt && s.lastRunAt.getTime() + s.syncIntervalMinutes * 60e3 + jitter > now.getTime()) continue;
      await this.core.runSync(s.code, ExternalSyncKind.FULL).catch((e) => this.logger.warn(`Sync ${s.code} skipped: ${e instanceof Error ? e.message : e}`));
    }
  }
}
