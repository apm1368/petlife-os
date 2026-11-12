import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ExternalAutomationStatus, ExternalSourceMode, ExternalSyncKind, ExternalSyncTrigger, type ExternalTravelSource } from "@prisma/client";
import type Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { REDIS_CLIENT } from "../../common/redis/redis.module";
import { registerWorker, trackWorker } from "../../common/workers/worker-heartbeat";
import { TravelExternalService } from "./travel-external.service";

const TICK_MS = 10 * 60e3;
const DAILY_LOCK = "travel-ext-daily-sync";
const HEALTH_CHECK_EVERY_MS = 24 * 3600e3;
/** A run that failed on a timeout or a 5xx is tried again an hour later, at most three times, instead of a day later. */
const TRANSIENT_RETRY_AFTER_MS = 3600e3;
const TRANSIENT_RETRY_LIMIT = 3;
const TRANSIENT_CATEGORIES = ["TIMEOUT", "SOURCE_UNAVAILABLE", "NETWORK"];

type ScheduleFields = Pick<ExternalTravelSource, "id" | "lastRunAt" | "lastDurationMs" | "syncIntervalMinutes" | "consecutiveFailures" | "lastErrorCategory">;

/**
 * Is a FULL sync due? The interval counts from when the last run started (lastRunAt is stamped when it finishes), so a
 * long crawl does not push every following daily run later. Circuit state is checked by the caller.
 */
export function syncDue(s: ScheduleFields, now: Date): boolean {
  if (!s.lastRunAt) return true;
  const lastStart = s.lastRunAt.getTime() - Math.max(0, s.lastDurationMs ?? 0);
  const jitter = (parseInt(s.id.slice(0, 4), 16) % 30) * 60e3; // 0–29 min, stable per source
  if (lastStart + s.syncIntervalMinutes * 60e3 + jitter <= now.getTime()) return true;
  const transient = s.consecutiveFailures > 0 && s.consecutiveFailures <= TRANSIENT_RETRY_LIMIT && TRANSIENT_CATEGORIES.includes(s.lastErrorCategory ?? "");
  return transient && s.lastRunAt.getTime() + TRANSIENT_RETRY_AFTER_MS <= now.getTime();
}

/**
 * ExternalTravelDailySyncWorker. Every 10 min, under one distributed lock (one VPS-wide runner): abandon stuck runs;
 * then, one source at a time, start a FULL sync for each AUTOMATED+SUPPORTED source whose interval (default 24 h, from the
 * last run's start) plus a per-source jitter has elapsed and whose circuit is closed; a run that failed on a timeout or
 * 5xx is retried an hour later (at most three times). A low-frequency health check (once a day) runs for every source
 * that has an adapter, even when automation is off, so the ERP sees access changes. Raw excerpts are pruned.
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
        if (!syncDue(s, now)) continue;
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
