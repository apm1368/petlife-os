import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NotificationChannel, NotificationDeliveryStatus, PaymentAttemptStatus, PaymentProvider, PrivacyRequestStatus, ProviderEventStatus } from "@prisma/client";
import type Redis from "ioredis";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { REDIS_CLIENT } from "../../../common/redis/redis.module";
import { workerHeartbeats } from "../../../common/workers/worker-heartbeat";
import type { AppEnv } from "../../../config/env";

export type IntegrationStatus = "LIVE" | "SANDBOX" | "NOT_CONFIGURED" | "NOT_IMPLEMENTED" | "BLOCKED_EXTERNAL" | "ERROR";
const OUTBOX_STALE_MS = 5 * 60_000;

async function timed<T>(work: () => Promise<T>, ms = 2000): Promise<{ ok: boolean; latencyMs: number | null }> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((r) => { timer = setTimeout(() => r(false), ms); });
  try {
    const ok = await Promise.race([work().then(() => true, () => false), timeout]);
    return { ok, latencyMs: ok ? Date.now() - started : null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ERP-A system health + integration status. Read-only and secret-free: only up/down, counts, timestamps, error
 * *categories* and the NAMES of missing configuration keys are returned — never values, hosts or provider messages.
 */
@Injectable()
export class AdminSystemService {
  private readonly startedAt = new Date();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  private env<K extends keyof AppEnv>(k: K): AppEnv[K] {
    return this.config.get(k, { infer: true });
  }

  async health() {
    const now = Date.now();
    const [database, redis, storage, outbox, notifications, payments, exports, migrations] = await Promise.all([
      timed(() => this.prisma.$queryRaw`SELECT 1`),
      timed(() => this.redis.ping()),
      this.storageCheck(),
      this.outbox(now),
      this.prisma.notificationDelivery.groupBy({ by: ["status"], where: { createdAt: { gte: new Date(now - 86400e3) } }, _count: { _all: true } }),
      this.prisma.paymentProviderEvent.count({ where: { status: ProviderEventStatus.FAILED } }),
      this.prisma.dataExportRequest.count({ where: { status: PrivacyRequestStatus.FAILED } }),
      this.migrations(),
    ]);
    const workers = workerHeartbeats().map((w) => {
      const last = w.lastSucceededAt ? Date.parse(w.lastSucceededAt) : null;
      // A worker is late if it hasn't succeeded within three of its intervals since boot.
      const late = (last ?? this.startedAt.getTime()) < now - 3 * w.intervalMs && now - this.startedAt.getTime() > 3 * w.intervalMs;
      return { ...w, status: w.lastFailedAt && (!last || Date.parse(w.lastFailedAt) > last) ? "FAILING" : late ? "LATE" : last ? "OK" : "WAITING_FIRST_RUN" };
    });
    const notif = Object.fromEntries(notifications.map((n) => [n.status, n._count._all]));
    const components = {
      api: { status: "UP", startedAt: this.startedAt.toISOString(), uptimeSeconds: Math.round((now - this.startedAt.getTime()) / 1000), nodeEnv: this.env("NODE_ENV") },
      database: { status: database.ok ? "UP" : "DOWN", latencyMs: database.latencyMs },
      redis: { status: redis.ok ? "UP" : "DOWN", latencyMs: redis.latencyMs },
      storage,
      outbox,
      workers,
      notifications24h: { sent: (notif.SENT ?? 0) + (notif.DELIVERED ?? 0), failed: notif.FAILED ?? 0, pending: (notif.PENDING ?? 0) + (notif.QUEUED ?? 0) + (notif.SENDING ?? 0), skipped: notif.SKIPPED ?? 0 },
      failedJobs: { paymentProviderEvents: payments, dataExports: exports, outboxEventsWithErrors: outbox.withErrors },
      migrations,
      deploy: { version: this.env("APP_VERSION"), sha: this.env("BUILD_SHA"), buildTime: this.env("BUILD_TIME"), environment: this.env("DEPLOYMENT_ENVIRONMENT"), deploymentId: this.env("DEPLOYMENT_ID") },
    };
    // DOWN: the database is unreachable. DEGRADED: a dependency, a migration or a worker is broken. LAGGING: everything
    // works but work is queuing (outbox events with listeners waiting > 5 min, or a worker late). HEALTHY otherwise.
    // Record-only events are written already processed, so only real backlog counts as lag.
    const degraded = !redis.ok || storage.status !== "UP" || migrations.status !== "OK" || workers.some((w) => w.status === "FAILING");
    const lagging = outbox.status !== "OK" || workers.some((w) => w.status === "LATE");
    const status = !database.ok ? "DOWN" : degraded ? "DEGRADED" : lagging ? "LAGGING" : "HEALTHY";
    return { status, checkedAt: new Date(now).toISOString(), components };
  }

  private async storageCheck() {
    const driver = this.env("STORAGE_DRIVER");
    if (driver === "s3") {
      const missing = (["STORAGE_S3_BUCKET", "STORAGE_S3_REGION", "STORAGE_S3_ACCESS_KEY_ID", "STORAGE_S3_SECRET_ACCESS_KEY"] as const).filter((k) => !this.env(k));
      return { status: missing.length ? "MISCONFIGURED" : "UP", driver, writable: null, missingConfiguration: missing };
    }
    const dir = resolve(this.env("STORAGE_LOCAL_DIR"), ".health");
    const probe = join(dir, `probe-${process.pid}`);
    const write = await timed(async () => { await mkdir(dir, { recursive: true }); await writeFile(probe, "ok"); await unlink(probe); });
    return { status: write.ok ? "UP" : "DOWN", driver, writable: write.ok, missingConfiguration: [] as string[] };
  }

  private async outbox(now: number) {
    const [pending, oldest, withErrors] = await Promise.all([
      this.prisma.domainEvent.count({ where: { processedAt: null } }),
      this.prisma.domainEvent.findFirst({ where: { processedAt: null }, orderBy: { occurredAt: "asc" }, select: { occurredAt: true } }),
      this.prisma.domainEvent.count({ where: { processedAt: null, lastError: { not: null } } }),
    ]);
    const lagMs = oldest ? now - oldest.occurredAt.getTime() : 0;
    return { status: lagMs > OUTBOX_STALE_MS ? "LAGGING" : "OK", pending, oldestPendingAt: oldest?.occurredAt.toISOString() ?? null, lagSeconds: Math.round(lagMs / 1000), withErrors };
  }

  private async migrations() {
    const rows = await this.prisma.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`;
    const applied = rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
    const failed = rows.filter((r) => !r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
    let onDisk: string[] | null = null;
    try {
      onDisk = (await readdir(resolve(process.cwd(), "prisma/migrations"), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    } catch {
      onDisk = null; // not shipped alongside this build
    }
    const pending = onDisk ? onDisk.filter((m) => !applied.includes(m)) : null;
    return { status: failed.length || (pending && pending.length) ? "ATTENTION" : "OK", appliedCount: applied.length, latest: applied[applied.length - 1] ?? null, failed, pending };
  }

  async integrations() {
    const e = <K extends keyof AppEnv>(k: K) => this.env(k);
    const missing = (keys: (keyof AppEnv)[]) => keys.filter((k) => !e(k)) as string[];
    const [smsSent, smsFailed, paySucceeded, payFailed] = await Promise.all([
      this.prisma.notificationDelivery.findFirst({ where: { channel: NotificationChannel.SMS, status: { in: [NotificationDeliveryStatus.SENT, NotificationDeliveryStatus.DELIVERED] } }, orderBy: { lastAttemptAt: "desc" }, select: { lastAttemptAt: true, provider: true } }),
      this.prisma.notificationDelivery.findFirst({ where: { channel: NotificationChannel.SMS, status: NotificationDeliveryStatus.FAILED }, orderBy: { failedAt: "desc" }, select: { failedAt: true, failureKind: true } }),
      this.prisma.paymentAttempt.findFirst({ where: { status: PaymentAttemptStatus.SUCCEEDED, provider: { not: PaymentProvider.DEV_SIMULATED } }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
      this.prisma.paymentAttempt.findFirst({ where: { status: PaymentAttemptStatus.FAILED, provider: { not: PaymentProvider.DEV_SIMULATED } }, orderBy: { completedAt: "desc" }, select: { completedAt: true, failureCode: true } }),
    ]);
    const tls = String(e("WEB_APP_ORIGIN")).split(",").every((o) => o.trim().startsWith("https://"));
    const smsLive = e("MESSAGING_SANDBOX_MODE") === "production" && e("MESSAGING_PROVIDER") === "faraz";
    const farazMissing = missing(["FARAZ_SMS_BASE_URL", "FARAZ_SMS_API_KEY", "FARAZ_SMS_SENDER"]);
    const payProd = e("PAYMENT_SANDBOX_MODE") === "production";
    const item = (key: string, status: IntegrationStatus, extra: { mode?: string | null; missingConfiguration?: string[]; note?: string | null; lastSuccessAt?: Date | null; lastErrorAt?: Date | null; lastErrorCategory?: string | null } = {}) => ({
      key,
      status,
      mode: extra.mode ?? null,
      configurationComplete: (extra.missingConfiguration ?? []).length === 0,
      missingConfiguration: extra.missingConfiguration ?? [],
      lastSuccessAt: extra.lastSuccessAt?.toISOString() ?? null,
      lastErrorAt: extra.lastErrorAt?.toISOString() ?? null,
      lastErrorCategory: extra.lastErrorCategory ?? null,
      note: extra.note ?? null,
    });
    const items = [
      item("TLS", tls ? "LIVE" : "NOT_CONFIGURED", { mode: tls ? "https" : "http", note: tls ? null : "Site is served over plain HTTP; secure cookies are off until TLS + NODE_ENV=production." }),
      item("OTP", e("OTP_PROVIDER") === "dev" ? "SANDBOX" : "LIVE", { mode: e("OTP_PROVIDER"), note: e("OTP_PROVIDER") === "dev" ? "Codes are generated by the dev provider, not sent by SMS." : null }),
      item("FARAZ_SMS", smsLive ? "LIVE" : e("MESSAGING_PROVIDER") === "faraz" || e("FARAZ_SMS_ENABLED") ? (farazMissing.length ? "NOT_CONFIGURED" : "SANDBOX") : "NOT_CONFIGURED", { mode: `${e("MESSAGING_PROVIDER")}/${e("MESSAGING_SANDBOX_MODE")}`, missingConfiguration: farazMissing, lastSuccessAt: smsSent?.lastAttemptAt ?? null, lastErrorAt: smsFailed?.failedAt ?? null, lastErrorCategory: smsFailed?.failureKind ?? null, note: "Real credentials/documentation not provided — BLOCKED_EXTERNAL for production." }),
      item("EMAIL", "NOT_IMPLEMENTED", { note: "No email provider adapter exists." }),
      item("GOOGLE_AUTH", e("GOOGLE_AUTH_ENABLED") ? (missing(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALLBACK_URL"]).length ? "NOT_CONFIGURED" : "LIVE") : e("GOOGLE_DEV_SIMULATE_ENABLED") ? "SANDBOX" : "NOT_CONFIGURED", { missingConfiguration: e("GOOGLE_AUTH_ENABLED") ? missing(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALLBACK_URL"]) : [] }),
      item("PAYMENT", payProd ? "LIVE" : "SANDBOX", { mode: e("PAYMENT_SANDBOX_MODE"), missingConfiguration: payProd ? missing(["STANDARD_GATEWAY_MERCHANT_ID", "STANDARD_GATEWAY_API_KEY"]) : [], lastSuccessAt: paySucceeded?.completedAt ?? null, lastErrorAt: payFailed?.completedAt ?? null, lastErrorCategory: payFailed?.failureCode ?? null, note: payProd ? null : "Payments run against the sandbox; production economics are a product decision." }),
      item("BNPL", !e("SNAPPAY_ENABLED") && !e("DIGIPAY_ENABLED") ? "NOT_CONFIGURED" : payProd ? "LIVE" : "SANDBOX", { mode: [e("SNAPPAY_ENABLED") ? "snappay" : null, e("DIGIPAY_ENABLED") ? "digipay" : null].filter(Boolean).join(",") || null, missingConfiguration: payProd ? missing(["SNAPPAY_MERCHANT_ID", "SNAPPAY_API_KEY", "DIGIPAY_MERCHANT_ID", "DIGIPAY_API_KEY"]) : [] }),
      item("SHIPPING", e("SHIPPING_MODE") === "production" ? "LIVE" : "SANDBOX", { mode: e("SHIPPING_MODE"), missingConfiguration: e("SHIPPING_MODE") === "production" ? missing(["ALOPEYK_API_KEY", "SNAPPBOX_API_KEY"]) : [] }),
      item("MARKETPLACE", e("MARKETPLACE_SANDBOX_MODE") === "production" ? "LIVE" : "SANDBOX", { mode: e("MARKETPLACE_SANDBOX_MODE"), missingConfiguration: e("MARKETPLACE_SANDBOX_MODE") === "production" ? missing(["TOROB_API_KEY", "DIGIKALA_API_KEY"]) : [] }),
      item("MAPS", "NOT_IMPLEMENTED", { mode: e("TRANSPORT_DISTANCE_MODE"), note: "No map/geocoding provider; distances are straight-line demo at most. BLOCKED_EXTERNAL (provider choice + credentials)." }),
      item("STORAGE_S3", e("STORAGE_DRIVER") === "s3" ? (missing(["STORAGE_S3_BUCKET", "STORAGE_S3_ACCESS_KEY_ID", "STORAGE_S3_SECRET_ACCESS_KEY"]).length ? "ERROR" : "LIVE") : "NOT_CONFIGURED", { mode: e("STORAGE_DRIVER") === "s3" ? "s3" : "local_disk", missingConfiguration: e("STORAGE_DRIVER") === "s3" ? missing(["STORAGE_S3_BUCKET", "STORAGE_S3_ACCESS_KEY_ID", "STORAGE_S3_SECRET_ACCESS_KEY"]) : [], note: e("STORAGE_DRIVER") === "s3" ? null : "Uploads are stored on the server's local disk." }),
    ];
    return { checkedAt: new Date().toISOString(), items };
  }
}
