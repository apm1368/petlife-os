import { Injectable } from "@nestjs/common";
import { SubscriptionEntitlementType } from "@prisma/client";
import type { ResolvedEntitlementDto, SubscriptionUsageItemDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SubscriptionEntitlementLimitExceededException } from "../../common/errors/api-exception";
import { PAID_ACCESS_STATUSES, SubscriptionService } from "./subscription.service";
import { SubscriptionPlanReadService } from "./subscription-plan-read.service";
import { UsageService } from "./usage.service";

/**
 * The one place any feature asks "can this household do X" or "what's the
 * limit for Y" (spec: "features should not check `if plan == PREMIUM`...
 * create a reusable entitlement resolution service"). Resolution order,
 * always: an active `SubscriptionEntitlementOverride` for the key wins
 * outright; otherwise the household's *effective* plan — its own current
 * plan while `PAID_ACCESS_STATUSES` holds (do not revoke access
 * immediately), the FREE plan once truly CANCELLED/EXPIRED — supplies the
 * entitlement; a key neither plan defines resolves to the safest default
 * (`false`/`0`), never `undefined` or a thrown error, so a caller can
 * always make a decision.
 */
@Injectable()
export class EntitlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionService,
    private readonly plans: SubscriptionPlanReadService,
    private readonly usage: UsageService,
  ) {}

  private async resolveEffectivePlanEntitlements(householdId: string) {
    const sub = await this.subscriptions.getOrCreateRaw(householdId);
    const usesCurrentPlan = PAID_ACCESS_STATUSES.includes(sub.status);
    const plan = usesCurrentPlan ? await this.plans.getRawById(sub.planId) : await this.plans.getFreePlanRaw();
    return plan.entitlements;
  }

  private async activeOverrides(householdId: string) {
    const now = new Date();
    return this.prisma.subscriptionEntitlementOverride.findMany({
      where: { householdId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    });
  }

  async resolveAll(householdId: string): Promise<ResolvedEntitlementDto[]> {
    const [planEntitlements, overrides] = await Promise.all([this.resolveEffectivePlanEntitlements(householdId), this.activeOverrides(householdId)]);
    const overrideByKey = new Map(overrides.map((o) => [o.key, o]));
    const keys = new Set([...planEntitlements.map((e) => e.key), ...overrideByKey.keys()]);

    return Array.from(keys).map((key) => {
      const override = overrideByKey.get(key);
      if (override) return { key, type: override.type as unknown as ResolvedEntitlementDto["type"], boolValue: override.boolValue, limitValue: override.limitValue, overridden: true };
      const planRow = planEntitlements.find((e) => e.key === key)!;
      return { key, type: planRow.type as unknown as ResolvedEntitlementDto["type"], boolValue: planRow.boolValue, limitValue: planRow.limitValue, overridden: false };
    });
  }

  async resolveOne(householdId: string, key: string): Promise<ResolvedEntitlementDto | null> {
    const all = await this.resolveAll(householdId);
    return all.find((e) => e.key === key) ?? null;
  }

  /** For a BOOLEAN entitlement. A key that resolves to nothing (neither plan nor override defines it) is treated as `false` — the safe default. */
  async has(householdId: string, key: string): Promise<boolean> {
    const resolved = await this.resolveOne(householdId, key);
    return resolved?.boolValue ?? false;
  }

  /** For a LIMIT entitlement. `null` means unlimited; a key that resolves to nothing is treated as `0` (the most restrictive, safe default) — never unlimited by omission. */
  async getLimit(householdId: string, key: string): Promise<number | null> {
    const resolved = await this.resolveOne(householdId, key);
    if (!resolved) return 0;
    return resolved.limitValue;
  }

  async getUsageItem(householdId: string, key: string): Promise<SubscriptionUsageItemDto> {
    const [limit, used] = await Promise.all([this.getLimit(householdId, key), this.usage.getUsage(householdId, key)]);
    return { key, limit, used, remaining: limit === null ? null : Math.max(0, limit - used) };
  }

  async listUsage(householdId: string): Promise<SubscriptionUsageItemDto[]> {
    const all = await this.resolveAll(householdId);
    const limitKeys = all.filter((e) => e.type === SubscriptionEntitlementType.LIMIT && UsageService.isMetered(e.key)).map((e) => e.key);
    return Promise.all(limitKeys.map((key) => this.getUsageItem(householdId, key)));
  }

  /**
   * spec: "limit checks must happen server-side... API returns typed
   * entitlement/limit error." Called by any domain service before creating
   * one more of a metered resource (e.g. PetsService.create). Throws
   * `SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED` with the exact key/limit/used
   * in `details` so the UI can render the precise message the spec's own
   * worked example shows, never a generic failure.
   */
  async assertWithinLimit(householdId: string, key: string): Promise<void> {
    const item = await this.getUsageItem(householdId, key);
    if (item.limit !== null && item.used >= item.limit) {
      throw new SubscriptionEntitlementLimitExceededException({ key, limit: item.limit, used: item.used });
    }
  }
}
