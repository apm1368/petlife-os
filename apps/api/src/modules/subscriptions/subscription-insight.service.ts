import { Injectable } from "@nestjs/common";
import { SubscriptionEntitlementType, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { EntitlementService } from "./entitlement.service";
import { UsageService } from "./usage.service";

const DAY = 86400e3;

/**
 * Read-only, server-derived views over the household subscription: one summary (status, plan, trial with
 * daysRemaining, renewal date, real usage against limits) and a downgrade impact preview. Nothing here changes a
 * subscription, and a downgrade never deletes data — over-limit resources stay readable, new ones are blocked.
 */
@Injectable()
export class SubscriptionInsightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly usage: UsageService,
  ) {}

  async summary(householdId: string, now = new Date()) {
    const sub = await this.prisma.subscription.findUnique({ where: { householdId }, include: { plan: true, currentPeriod: true } });
    const usage = await this.entitlements.listUsage(householdId);
    if (!sub) return { status: SubscriptionStatus.ACTIVE, plan: null, trial: null, renewalAt: null, cancelEffectiveAt: null, usage };
    const trial = sub.status === SubscriptionStatus.TRIALING && sub.trialEndsAt ? await this.prisma.subscriptionTrial.findFirst({ where: { subscriptionId: sub.id }, orderBy: { startAt: "desc" } }) : null;
    const renews = [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.GRACE_PERIOD].includes(sub.status as never) && !sub.plan.isFree;
    return {
      status: sub.status,
      plan: { code: sub.plan.code, nameFa: sub.plan.nameFa, nameEn: sub.plan.nameEn, isFree: sub.plan.isFree },
      trial: sub.status === SubscriptionStatus.TRIALING && sub.trialEndsAt
        ? { startsAt: (trial?.startAt ?? sub.createdAt).toISOString(), endsAt: sub.trialEndsAt.toISOString(), daysRemaining: Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / DAY)) }
        : null,
      renewalAt: renews ? sub.currentPeriod?.endAt.toISOString() ?? null : null,
      cancelEffectiveAt: sub.cancelEffectiveAt?.toISOString() ?? null,
      usage,
    };
  }

  /**
   * What would change on a move to `planCode`: metered resources over the target limit (kept readable, new
   * creation blocked) and features the target doesn't include (existing data kept).
   */
  async downgradePreview(householdId: string, planCode: string) {
    const target = await this.prisma.subscriptionPlan.findUnique({ where: { code: planCode }, include: { entitlements: true } });
    if (!target || target.status !== "ACTIVE") throw new NotFoundApiException("SubscriptionPlan");
    const current = await this.entitlements.resolveAll(householdId);
    const overLimitResources: { resource: string; usage: number; targetLimit: number; behavior: "EXISTING_READABLE_NEW_CREATION_BLOCKED" }[] = [];
    for (const key of UsageService.meteredKeys()) {
      const row = target.entitlements.find((e) => e.key === key && e.type === SubscriptionEntitlementType.LIMIT);
      // A metered key the target doesn't define resolves to 0 — the same safe default EntitlementService uses.
      const targetLimit = row ? row.limitValue : 0;
      if (targetLimit === null) continue;
      const used = await this.usage.getUsage(householdId, key);
      if (used > targetLimit) overLimitResources.push({ resource: key, usage: used, targetLimit, behavior: "EXISTING_READABLE_NEW_CREATION_BLOCKED" });
    }
    const lostFeatures = current
      .filter((e) => e.type === "BOOLEAN" && e.boolValue === true && !e.overridden)
      .filter((e) => !target.entitlements.some((t) => t.key === e.key && t.type === SubscriptionEntitlementType.BOOLEAN && t.boolValue === true))
      .map((e) => ({ feature: e.key, behavior: "FEATURE_UNAVAILABLE_EXISTING_DATA_KEPT" as const }));
    return { targetPlan: { code: target.code, nameFa: target.nameFa, nameEn: target.nameEn }, overLimitResources, lostFeatures, dataDeleted: false };
  }
}
