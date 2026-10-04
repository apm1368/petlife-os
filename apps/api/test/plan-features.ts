import { randomUUID } from "node:crypto";
import { SubscriptionEntitlementType, SubscriptionStatus } from "@prisma/client";
import type { PrismaService } from "../src/common/prisma/prisma.service";
import { UsageService } from "../src/modules/subscriptions/usage.service";

/** Puts a household on an ACTIVE plan that includes the given BOOLEAN features — for suites that exercise paid features. */
export async function grantPlanFeatures(db: PrismaService, householdId: string, keys: string[]): Promise<void> {
  const code = `test-features-${randomUUID()}`;
  const plan = await db.subscriptionPlan.create({
    data: {
      code,
      nameFa: "پلن آزمون",
      nameEn: "Test plan",
      entitlements: {
        create: [
          ...keys.map((key) => ({ key, type: SubscriptionEntitlementType.BOOLEAN, boolValue: true })),
          // Unlimited metered resources, so suites that probe limits do so with explicit overrides.
          ...UsageService.meteredKeys().map((key) => ({ key, type: SubscriptionEntitlementType.LIMIT, limitValue: null })),
        ],
      },
    },
  });
  await db.subscription.upsert({
    where: { householdId },
    create: { householdId, planId: plan.id, status: SubscriptionStatus.ACTIVE },
    update: { planId: plan.id, status: SubscriptionStatus.ACTIVE },
  });
}
