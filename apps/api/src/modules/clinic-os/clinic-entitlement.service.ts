import { Injectable } from "@nestjs/common";
import { Prisma, SubscriptionEntitlementType, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SubscriptionEntitlementLimitExceededException, SubscriptionFeatureNotIncludedException } from "../../common/errors/api-exception";

/** Statuses whose plan entitlements apply; CANCELLED/EXPIRED fall back to the default plan, like households. */
const PAID_ACCESS: SubscriptionStatus[] = [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.GRACE_PERIOD, SubscriptionStatus.CANCEL_AT_PERIOD_END];

const PLAN_INCLUDE = { entitlements: true, prices: { where: { status: "ACTIVE" as const }, orderBy: { billingInterval: "asc" as const } } } satisfies Prisma.ClinicPlanInclude;
type PlanRow = Prisma.ClinicPlanGetPayload<{ include: typeof PLAN_INCLUDE }>;

export interface ClinicEntitlementValue {
  key: string;
  type: SubscriptionEntitlementType;
  enabled: boolean;
  /** LIMIT only; null = unlimited. */
  limit: number | null;
}

export interface ResolvedClinicPlan {
  subscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodEndsAt: Date | null;
  /** The plan whose entitlements apply right now (the default plan once a paid one has lapsed). */
  effectivePlan: PlanRow;
  /** The plan on the subscription row (differs from effectivePlan only after a lapse). */
  assignedPlanCode: string;
  entitlements: Record<string, ClinicEntitlementValue>;
}

/**
 * The clinic (B2B) entitlement context — completely separate from the household EntitlementService:
 * clinic plans live in their own tables and are resolved per ProviderOrganization, never per household.
 * Every check reads entitlement rows; nothing here compares plan codes.
 */
@Injectable()
export class ClinicEntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  async defaultPlan(): Promise<PlanRow> {
    return this.prisma.clinicPlan.findFirstOrThrow({ where: { isDefault: true }, include: PLAN_INCLUDE });
  }

  /** Lazily and idempotently gives an organisation its row on the default plan, then resolves it. */
  async resolve(organizationId: string): Promise<ResolvedClinicPlan> {
    let sub = await this.prisma.clinicSubscription.findUnique({ where: { providerOrganizationId: organizationId }, include: { plan: { include: PLAN_INCLUDE } } });
    if (!sub) {
      const plan = await this.defaultPlan();
      try {
        sub = await this.prisma.clinicSubscription.create({ data: { providerOrganizationId: organizationId, planId: plan.id }, include: { plan: { include: PLAN_INCLUDE } } });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        sub = await this.prisma.clinicSubscription.findUniqueOrThrow({ where: { providerOrganizationId: organizationId }, include: { plan: { include: PLAN_INCLUDE } } });
      }
    }
    const lapsed = !PAID_ACCESS.includes(sub.status) || (sub.currentPeriodEndsAt !== null && sub.currentPeriodEndsAt <= new Date());
    const effectivePlan = lapsed ? await this.defaultPlan() : sub.plan;
    return {
      subscriptionId: sub.id,
      status: lapsed && sub.status !== SubscriptionStatus.CANCELLED ? SubscriptionStatus.EXPIRED : sub.status,
      currentPeriodEndsAt: sub.currentPeriodEndsAt,
      effectivePlan,
      assignedPlanCode: sub.plan.code,
      entitlements: await this.withOverrides(organizationId, toEntitlementMap(effectivePlan)),
    };
  }

  /** ERP-C: active, unexpired staff overrides replace the plan value for their key (no payment involved). */
  private async withOverrides(organizationId: string, map: Record<string, ClinicEntitlementValue>) {
    const overrides = await this.prisma.clinicEntitlementOverride.findMany({ where: { providerOrganizationId: organizationId, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: { createdAt: "asc" } });
    for (const o of overrides) {
      const base = map[o.key];
      const type = base?.type ?? (o.boolValue !== null ? SubscriptionEntitlementType.BOOLEAN : SubscriptionEntitlementType.LIMIT);
      map[o.key] = type === SubscriptionEntitlementType.BOOLEAN ? { key: o.key, type, enabled: o.boolValue === true, limit: null } : { key: o.key, type, enabled: true, limit: o.unlimited ? null : o.limitValue };
    }
    return map;
  }

  async hasFeature(organizationId: string, key: string): Promise<boolean> {
    return (await this.resolve(organizationId)).entitlements[key]?.enabled === true;
  }

  async assertFeature(organizationId: string, key: string): Promise<void> {
    if (!(await this.hasFeature(organizationId, key))) throw new SubscriptionFeatureNotIncludedException({ key, context: "CLINIC" });
  }

  /** Throws when `used` already reaches the plan's limit. A missing LIMIT row means the feature has no cap. */
  async assertWithinLimit(organizationId: string, key: string, used: number): Promise<void> {
    const value = (await this.resolve(organizationId)).entitlements[key];
    if (!value || value.limit === null) return;
    if (used >= value.limit) throw new SubscriptionEntitlementLimitExceededException({ key, limit: value.limit, used, context: "CLINIC" });
  }
}

export function toEntitlementMap(plan: PlanRow): Record<string, ClinicEntitlementValue> {
  return Object.fromEntries(
    plan.entitlements.map((e) => [
      e.key,
      { key: e.key, type: e.type, enabled: e.type === SubscriptionEntitlementType.BOOLEAN ? e.boolValue === true : true, limit: e.type === SubscriptionEntitlementType.LIMIT ? e.limitValue : null },
    ]),
  );
}

export function toPlanDto(plan: PlanRow) {
  return {
    code: plan.code,
    nameFa: plan.nameFa,
    nameEn: plan.nameEn,
    descriptionFa: plan.descriptionFa,
    descriptionEn: plan.descriptionEn,
    isDefault: plan.isDefault,
    entitlements: Object.values(toEntitlementMap(plan)),
    /** Empty until the owner sets clinic pricing — the UI must then say "pricing not announced", never invent a price. */
    prices: plan.prices.map((p) => ({ billingInterval: p.billingInterval, amount: p.amount, currency: p.currency })),
  };
}

export { PLAN_INCLUDE as CLINIC_PLAN_INCLUDE };
