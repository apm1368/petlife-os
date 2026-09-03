import type { Prisma } from "@prisma/client";
import type {
  AdminActorSummaryDto,
  SubscriptionBillingAttemptDto,
  SubscriptionChangeDto,
  SubscriptionDto,
  SubscriptionPeriodDto,
  SubscriptionPlanDto,
  SubscriptionPlanEntitlementDto,
  SubscriptionPlanPriceDto,
  SubscriptionPlanRefDto,
} from "@petlife/types";

export const PLAN_INCLUDE = {
  entitlements: true,
  countryAvailability: true,
  prices: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.SubscriptionPlanInclude;

export type PlanWithRelations = Prisma.SubscriptionPlanGetPayload<{ include: typeof PLAN_INCLUDE }>;

export function toPlanEntitlementDto(row: Prisma.SubscriptionPlanEntitlementGetPayload<Record<string, never>>): SubscriptionPlanEntitlementDto {
  return {
    key: row.key,
    type: row.type as unknown as SubscriptionPlanEntitlementDto["type"],
    boolValue: row.boolValue,
    limitValue: row.limitValue,
  };
}

export function toPlanPriceDto(row: Prisma.SubscriptionPlanPriceGetPayload<Record<string, never>>): SubscriptionPlanPriceDto {
  return {
    id: row.id,
    countryCode: row.countryCode,
    currency: row.currency,
    billingInterval: row.billingInterval as unknown as SubscriptionPlanPriceDto["billingInterval"],
    amount: row.amount,
    status: row.status as unknown as SubscriptionPlanPriceDto["status"],
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString() : null,
  };
}

export function toPlanRefDto(row: { id: string; code: string; nameFa: string; nameEn: string }): SubscriptionPlanRefDto {
  return { id: row.id, code: row.code, nameFa: row.nameFa, nameEn: row.nameEn };
}

export function toPlanDto(row: PlanWithRelations): SubscriptionPlanDto {
  return {
    id: row.id,
    code: row.code,
    nameFa: row.nameFa,
    nameEn: row.nameEn,
    descriptionFa: row.descriptionFa,
    descriptionEn: row.descriptionEn,
    status: row.status as unknown as SubscriptionPlanDto["status"],
    sortOrder: row.sortOrder,
    isFree: row.isFree,
    trialDays: row.trialDays,
    countryAvailability: row.countryAvailability.map((c) => c.countryCode),
    entitlements: row.entitlements.map(toPlanEntitlementDto),
    prices: row.prices.map(toPlanPriceDto),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAdminActorDto(admin: { id: string; role: string; user: { displayName: string | null; email: string | null } } | null): AdminActorSummaryDto | null {
  if (!admin) return null;
  return { id: admin.id, displayName: admin.user.displayName ?? admin.user.email ?? "Admin", role: admin.role as unknown as AdminActorSummaryDto["role"] };
}

export const PERIOD_INCLUDE = { plan: true } satisfies Prisma.SubscriptionPeriodInclude;
export type PeriodWithRelations = Prisma.SubscriptionPeriodGetPayload<{ include: typeof PERIOD_INCLUDE }>;

export function toPeriodDto(row: PeriodWithRelations, amount: number | null, currency: string): SubscriptionPeriodDto {
  return {
    id: row.id,
    status: row.status as unknown as SubscriptionPeriodDto["status"],
    plan: toPlanRefDto(row.plan),
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    isTrial: row.isTrial,
    amount,
    currency,
  };
}

export function toBillingAttemptDto(row: Prisma.SubscriptionBillingAttemptGetPayload<Record<string, never>>): SubscriptionBillingAttemptDto {
  return {
    id: row.id,
    reason: row.reason as unknown as SubscriptionBillingAttemptDto["reason"],
    attemptNumber: row.attemptNumber,
    status: row.status as unknown as SubscriptionBillingAttemptDto["status"],
    amount: row.amount,
    currency: row.currency,
    failureCode: row.failureCode,
    failureReason: row.failureReason,
    paymentIntentId: row.paymentIntentId,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export const CHANGE_INCLUDE = { fromPlan: true, toPlan: true, initiatedByAdmin: { include: { user: true } } } satisfies Prisma.SubscriptionChangeInclude;
export type ChangeWithRelations = Prisma.SubscriptionChangeGetPayload<{ include: typeof CHANGE_INCLUDE }>;

export function toChangeDto(row: ChangeWithRelations): SubscriptionChangeDto {
  return {
    id: row.id,
    type: row.type as unknown as SubscriptionChangeDto["type"],
    fromPlan: row.fromPlan ? toPlanRefDto(row.fromPlan) : null,
    toPlan: row.toPlan ? toPlanRefDto(row.toPlan) : null,
    effectiveAt: row.effectiveAt ? row.effectiveAt.toISOString() : null,
    note: row.note,
    initiatedByAdmin: toAdminActorDto(row.initiatedByAdmin),
    createdAt: row.createdAt.toISOString(),
  };
}

export const SUBSCRIPTION_INCLUDE = {
  plan: true,
  price: true,
  pendingPlan: true,
  pendingPrice: true,
  currentPeriod: { include: PERIOD_INCLUDE },
} satisfies Prisma.SubscriptionInclude;

export type SubscriptionWithRelations = Prisma.SubscriptionGetPayload<{ include: typeof SUBSCRIPTION_INCLUDE }>;

export function toSubscriptionDto(row: SubscriptionWithRelations): SubscriptionDto {
  return {
    id: row.id,
    status: row.status as unknown as SubscriptionDto["status"],
    plan: toPlanRefDto(row.plan),
    price: row.price ? toPlanPriceDto(row.price) : null,
    pendingPlan: row.pendingPlan ? toPlanRefDto(row.pendingPlan) : null,
    pendingPrice: row.pendingPrice ? toPlanPriceDto(row.pendingPrice) : null,
    currentPeriod: row.currentPeriod ? toPeriodDto(row.currentPeriod, row.price?.amount ?? null, row.price?.currency ?? "IRR") : null,
    trialEndsAt: row.trialEndsAt ? row.trialEndsAt.toISOString() : null,
    gracePeriodEndsAt: row.gracePeriodEndsAt ? row.gracePeriodEndsAt.toISOString() : null,
    cancelRequestedAt: row.cancelRequestedAt ? row.cancelRequestedAt.toISOString() : null,
    cancelEffectiveAt: row.cancelEffectiveAt ? row.cancelEffectiveAt.toISOString() : null,
    expiredAt: row.expiredAt ? row.expiredAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
