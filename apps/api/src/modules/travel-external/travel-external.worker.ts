import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ExternalAutomationStatus, ExternalSourceMode, ExternalSyncKind, ExternalSyncTrigger } from "@prisma/client";
import type Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { REDIS_CLIENT } from "../../common/redis/redis.module";
import { registerWorker, trackWorker } from "../../common/workers/worker-heartbeat";
import { TravelExternalService } from "./travel-external.service";

const TICK_MS = 10 * 60e3;
const DAILY_LOCK = "travel-ext-daily-sync";
const HEALTH_CHECK_EVERY_MS = 24 * 3600e3;

/**
 * ExternalTravelDailySyncWorker. Every 10 min, under one distributed lock (one VPS-wide runner): abandon stuck runs;
 * then, one source at a time, start a FULL sync for each AUTOMATED+SUPPORTED source whose interval (default 24 h) plus a
 * per-source jitter has elapsed and whose circuit is closed. A low-frequency health check (once a day) runs for every
 * source that has an adapter, even when automation is off, so the ERP sees access changes. Raw excerpts are pruned.
 */
@Injectable()
export class TravelExternalWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TravelExternalWorker.name);
  private timer?: NodeJS.Timeout;
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: TravelExternalService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    registerWorker("travel-external-sync", TICK_MS);
    this.timer = setInterval(() => void trackWorker("travel-external-sync", TICK_MS, () => this.tick()).catch((e) => this.logger.error("Travel external tick failed", e)), TICK_MS);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick(now = new Date()) {
    const token = randomUUID();
    if ((await this.redis.set(DAILY_LOCK, token, "PX", 6 * 3600e3, "NX")) !== "OK") return { skipped: "LOCKED" as const };
    const started: string[] = [];
    try {
      await this.core.abandonStuckRuns(now);
      const due = await this.prisma.externalTravelSource.findMany({ where: { mode: ExternalSourceMode.AUTOMATED, automationStatus: ExternalAutomationStatus.SUPPORTED, OR: [{ circuitOpenUntil: null }, { circuitOpenUntil: { lt: now } }] }, orderBy: { code: "asc" } });
      for (const s of due) {
        const jitter = (parseInt(s.id.slice(0, 4), 16) % 30) * 60e3; // 0–29 min, stable per source
        if (s.lastRunAt && s.lastRunAt.getTime() + s.syncIntervalMinutes * 60e3 + jitter > now.getTime()) continue;
        // Sequential on purpose: one source at a time, one request at a time.
        await this.core.runSync(s.code, ExternalSyncKind.FULL, { trigger: s.consecutiveFailures ? ExternalSyncTrigger.RETRY : ExternalSyncTrigger.SCHEDULED }).then(() => started.push(s.code)).catch((e) => this.logger.warn(`Sync ${s.code} skipped: ${e instanceof Error ? e.message : e}`));
      }
      await this.healthChecks(now);
      await this.core.pruneRawExcerpts(now);
    } finally {
      if ((await this.redis.get(DAILY_LOCK)) === token) await this.redis.del(DAILY_LOCK);
    }
    return { started };
  }

  private async healthChecks(now: Date) {
    const sources = await this.prisma.externalTravelSource.findMany({ where: { mode: { not: ExternalSourceMode.DISABLED } }, select: { code: true, discoveryNotes: true } });
    for (const s of sources) {
      const last = ((s.discoveryNotes as { lastHealthCheck?: { at?: string } } | null)?.lastHealthCheck?.at) ?? null;
      if (last && Date.parse(last) + HEALTH_CHECK_EVERY_MS > now.getTime()) continue;
      await this.core.healthCheck(s.code).catch((e) => this.logger.warn(`Health check ${s.code} failed: ${e instanceof Error ? e.message : e}`));
    }
  }
}
