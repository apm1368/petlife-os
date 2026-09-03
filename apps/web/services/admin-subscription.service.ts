import type {
  AdminSubscriptionDetailDto,
  AdminSubscriptionSummaryDto,
  PaginatedDto,
  SubscriptionBillingAttemptDto,
  SubscriptionBillingInterval,
  SubscriptionEntitlementOverrideDto,
  SubscriptionEntitlementType,
  SubscriptionPlanDto,
  SubscriptionPlanPriceDto,
  SubscriptionStatus,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface CreatePlanInput {
  code: string;
  nameFa: string;
  nameEn: string;
  descriptionFa?: string;
  descriptionEn?: string;
  sortOrder?: number;
  isFree?: boolean;
  trialDays?: number;
  countryAvailability: string[];
}

export interface UpsertEntitlementInput {
  key: string;
  type: SubscriptionEntitlementType;
  boolValue?: boolean;
  limitValue?: number | null;
}

export interface CreatePriceInput {
  countryCode: string;
  billingInterval: SubscriptionBillingInterval;
  amount: number;
}

export interface GrantOverrideInput {
  householdId: string;
  key: string;
  type: SubscriptionEntitlementType;
  boolValue?: boolean;
  limitValue?: number | null;
  reason: string;
  expiresAt?: string;
}

/** Admin Subscriptions surface (Handoff 16) — mirrors adminFinanceService's own self-contained shape. */
export const adminSubscriptionService = {
  listPlans: () => apiFetch<SubscriptionPlanDto[]>("/admin/subscriptions/plans"),
  getPlan: (planId: string) => apiFetch<SubscriptionPlanDto>(`/admin/subscriptions/plans/${planId}`),
  createPlan: (input: CreatePlanInput) => apiFetch<SubscriptionPlanDto>("/admin/subscriptions/plans", { method: "POST", body: input }),
  updatePlan: (planId: string, input: Partial<CreatePlanInput> & { status?: string }) => apiFetch<SubscriptionPlanDto>(`/admin/subscriptions/plans/${planId}`, { method: "PATCH", body: input }),
  upsertEntitlement: (planId: string, input: UpsertEntitlementInput) => apiFetch<SubscriptionPlanDto>(`/admin/subscriptions/plans/${planId}/entitlements`, { method: "POST", body: input }),
  createPrice: (planId: string, input: CreatePriceInput) => apiFetch<SubscriptionPlanPriceDto>(`/admin/subscriptions/plans/${planId}/prices`, { method: "POST", body: input }),
  updatePriceStatus: (priceId: string, status: "ACTIVE" | "INACTIVE") => apiFetch<SubscriptionPlanPriceDto>(`/admin/subscriptions/prices/${priceId}`, { method: "PATCH", body: { status } }),

  listHouseholdSubscriptions: (params: { status?: SubscriptionStatus; q?: string; page?: number; pageSize?: number }) =>
    apiFetch<PaginatedDto<AdminSubscriptionSummaryDto>>(`/admin/subscriptions/households${toQueryString(params)}`),
  getHouseholdSubscription: (householdId: string) => apiFetch<AdminSubscriptionDetailDto>(`/admin/subscriptions/households/${householdId}`),
  cancelHouseholdSubscription: (householdId: string, reason?: string) => apiFetch<AdminSubscriptionDetailDto>(`/admin/subscriptions/households/${householdId}/cancel`, { method: "POST", body: { reason } }),

  listBillingAttempts: (params: { householdId?: string; page?: number; pageSize?: number }) =>
    apiFetch<PaginatedDto<SubscriptionBillingAttemptDto>>(`/admin/subscriptions/billing-attempts${toQueryString(params)}`),
  refundBillingAttempt: (billingAttemptId: string, reason: string) => apiFetch<void>(`/admin/subscriptions/billing-attempts/${billingAttemptId}/refund`, { method: "POST", body: { reason } }),

  listOverrides: (householdId: string) => apiFetch<SubscriptionEntitlementOverrideDto[]>(`/admin/subscriptions/households/${householdId}/entitlement-overrides`),
  grantOverride: (input: GrantOverrideInput) => apiFetch<SubscriptionEntitlementOverrideDto>("/admin/subscriptions/entitlement-overrides", { method: "POST", body: input }),
  revokeOverride: (overrideId: string) => apiFetch<void>(`/admin/subscriptions/entitlement-overrides/${overrideId}`, { method: "DELETE" }),
};
