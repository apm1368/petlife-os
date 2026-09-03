import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AppEnv } from "../../config/env";
import { SubscriptionBillingService } from "./subscription-billing.service";

/**
 * The honest "DEV/manual adapter" for renewal the spec asks for (spec: "if
 * real automatic recurring charge is not available through existing
 * provider adapters, be honest — do NOT simulate production autopay...
 * support a system architecture for renewal and a DEV/manual adapter if
 * needed"). A plain `setInterval` poller, mirroring
 * `NotificationDeliveryWorkerService`'s own precedent exactly — no new
 * job-queue dependency for this modular monolith. Finds every subscription
 * whose current period has already ended and is still in a renewable
 * status, and attempts a renewal charge for each — `SubscriptionBillingService
 * .attemptRenewal()` itself row-locks the subscription and is a safe no-op
 * if another process already renewed it first. Never runs under
 * NODE_ENV=test; tests call `processDueRenewals()` directly for
 * determinism, the same convention every other DEV worker in this codebase
 * already uses.
 */
@Injectable()
export class SubscriptionRenewalWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionRenewalWorkerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: SubscriptionBillingService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    const intervalMs = this.config.get("SUBSCRIPTION_RENEWAL_WORKER_INTERVAL_MS", { infer: true });
    this.timer = setInterval(() => {
      this.processDueRenewals().catch((error) => this.logger.error("Subscription renewal worker tick failed", error instanceof Error ? error.stack : undefined));
    }, intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Returns the number of due subscriptions it attempted (not necessarily succeeded) — used by tests to assert real progress was made. */
  async processDueRenewals(limit = 50): Promise<number> {
    const due = await this.prisma.subscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.GRACE_PERIOD] },
        currentPeriod: { endAt: { lte: new Date() } },
      },
      take: limit,
      select: { id: true },
    });
    for (const row of due) {
      await this.billing.attemptRenewal(row.id).catch((error) => this.logger.error(`Renewal attempt failed for subscription ${row.id}`, error instanceof Error ? error.stack : undefined));
    }
    return due.length;
  }
}
