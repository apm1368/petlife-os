import { Injectable } from "@nestjs/common";
import { Prisma, SubscriptionBillingInterval, SubscriptionEntitlementType, SubscriptionPlanPriceStatus, SubscriptionPlanStatus } from "@prisma/client";
import type { SubscriptionPlanDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DEFAULT_COUNTRY_CODE } from "../../common/country/country-config";
import { SubscriptionPlanNotAvailableException, SubscriptionPlanNotFoundException, SubscriptionPlanPriceNotFoundException } from "../../common/errors/api-exception";
import { PLAN_INCLUDE, toPlanDto, type PlanWithRelations } from "./subscription-mapper";

/**
 * Code for the self-healing default FREE plan `getFreePlanRaw()` creates
 * when no environment-managed FREE plan exists yet (a fresh dev checkout,
 * or the isolated e2e test database, which CI populates via
 * `prisma migrate deploy` only — never `prisma db seed`). Deliberately the
 * same code the demo `seed.ts` catalog uses for its own FREE plan, so
 * running seed data afterward *updates* this row in place (richer fa/en
 * copy) rather than creating a second, orphaned FREE plan.
 */
export const DEFAULT_FREE_PLAN_CODE = "free";

/**
 * Read-only plan/price resolution shared by the consumer plans page, the
 * entitlement resolver, and admin inspection — never mutated here (see
 * `admin/subscriptions/admin-subscription-plan.service.ts` for writes).
 * `getFreePlan()` is the one place "which plan is the deterministic system
 * default" is decided (spec: "prefer a real FREE plan if it simplifies
 * consistent resolution") — every household's Subscription row is created
 * against whatever this resolves to, never a hardcoded plan code.
 */
@Injectable()
export class SubscriptionPlanReadService {
  constructor(private readonly prisma: PrismaService) {}

  async listForCountry(countryCode: string): Promise<SubscriptionPlanDto[]> {
    const rows = await this.prisma.subscriptionPlan.findMany({
      where: { status: SubscriptionPlanStatus.ACTIVE, countryAvailability: { some: { countryCode } } },
      include: PLAN_INCLUDE,
      orderBy: { sortOrder: "asc" },
    });
    return rows.map(toPlanDto);
  }

  async getById(planId: string): Promise<SubscriptionPlanDto> {
    const row = await this.getRawById(planId);
    return toPlanDto(row);
  }

  async getRawById(planId: string): Promise<PlanWithRelations> {
    const row = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId }, include: PLAN_INCLUDE });
    if (!row) throw new SubscriptionPlanNotFoundException({ planId });
    return row;
  }

  async getRawByCode(code: string): Promise<PlanWithRelations> {
    const row = await this.prisma.subscriptionPlan.findUnique({ where: { code }, include: PLAN_INCLUDE });
    if (!row) throw new SubscriptionPlanNotFoundException({ code });
    return row;
  }

  /**
   * Every household resolves entitlements against *some* FREE plan
   * (`SubscriptionService.getOrCreateRaw`, called on a household's very
   * first pet/page load) — this cannot be allowed to throw in an
   * environment that hasn't run `seed.ts` yet, since that would turn a
   * missing demo-data row into a 500 on a completely unrelated, core flow
   * (creating a pet). So this self-heals exactly like
   * `SubscriptionService.getOrCreateRaw` does for a household's own row:
   * find the admin-managed FREE plan if one exists, otherwise race-safely
   * create a minimal, conservative default (P2002 on the concurrent second
   * caller's insert simply re-reads the winner's row) with generous-enough
   * defaults that no unrelated existing flow is ever blocked by them. A
   * real deployment's admin can always edit this same row's copy/pricing
   * afterward — `seed.ts`'s own FREE plan uses the identical
   * `DEFAULT_FREE_PLAN_CODE`, so seeding upgrades this row in place rather
   * than creating a second FREE plan.
   */
  async getFreePlanRaw(): Promise<PlanWithRelations> {
    const existing = await this.prisma.subscriptionPlan.findFirst({ where: { isFree: true }, include: PLAN_INCLUDE });
    if (existing) return existing;

    try {
      return await this.prisma.subscriptionPlan.create({
        data: {
          code: DEFAULT_FREE_PLAN_CODE,
          nameFa: "رایگان",
          nameEn: "Free",
          descriptionEn: "The default plan every household starts on.",
          isFree: true,
          status: SubscriptionPlanStatus.ACTIVE,
          sortOrder: 0,
          countryAvailability: { create: { countryCode: DEFAULT_COUNTRY_CODE } },
          entitlements: {
            create: [
              { key: "pets.max", type: SubscriptionEntitlementType.LIMIT, limitValue: 3 },
              { key: "household.members.max", type: SubscriptionEntitlementType.LIMIT, limitValue: 5 },
            ],
          },
        },
        include: PLAN_INCLUDE,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return this.prisma.subscriptionPlan.findFirstOrThrow({ where: { isFree: true }, include: PLAN_INCLUDE });
      }
      throw error;
    }
  }

  /** Asserts the plan is actually subscribable right now: ACTIVE status and available in this country. Thrown as SUBSCRIPTION_PLAN_NOT_AVAILABLE, never a generic 404, so the UI can explain "not offered here" distinctly from "doesn't exist." */
  assertSubscribable(plan: PlanWithRelations, countryCode: string): void {
    if (plan.status !== SubscriptionPlanStatus.ACTIVE) throw new SubscriptionPlanNotAvailableException({ planId: plan.id, reason: "PLAN_NOT_ACTIVE" });
    if (!plan.countryAvailability.some((c) => c.countryCode === countryCode)) {
      throw new SubscriptionPlanNotAvailableException({ planId: plan.id, countryCode, reason: "NOT_AVAILABLE_IN_COUNTRY" });
    }
  }

  async resolveActivePrice(planId: string, countryCode: string, billingInterval: SubscriptionBillingInterval) {
    const price = await this.prisma.subscriptionPlanPrice.findFirst({
      where: { planId, countryCode, billingInterval, status: SubscriptionPlanPriceStatus.ACTIVE },
    });
    if (!price) throw new SubscriptionPlanPriceNotFoundException({ planId, countryCode, billingInterval });
    return price;
  }
}
