import type {
  ResolvedEntitlementDto,
  SubscriptionBillingHistoryDto,
  SubscriptionBillingInterval,
  SubscriptionChangeDto,
  SubscriptionDto,
  SubscriptionPlanDto,
  SubscriptionUsageItemDto,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface SubscribeInput {
  planId: string;
  billingInterval: SubscriptionBillingInterval;
  /** Sandbox-only outcome selector (Handoff 07's own PayCheckoutDto precedent) — never present against a real gateway. */
  mode?: "SUCCESS" | "FAILURE";
}

export interface SubscribeOutcome {
  attempt: unknown;
  subscription: SubscriptionDto;
}

export const subscriptionService = {
  getCurrent: (householdId: string) => apiFetch<SubscriptionDto>(`/households/${householdId}/subscription`),
  getPlans: (householdId: string) => apiFetch<SubscriptionPlanDto[]>(`/households/${householdId}/subscription/plans`),
  getEntitlements: (householdId: string) => apiFetch<ResolvedEntitlementDto[]>(`/households/${householdId}/subscription/entitlements`),
  getUsage: (householdId: string) => apiFetch<SubscriptionUsageItemDto[]>(`/households/${householdId}/subscription/usage`),
  getBillingHistory: (householdId: string) => apiFetch<SubscriptionBillingHistoryDto>(`/households/${householdId}/subscription/billing-history`),
  getChanges: (householdId: string) => apiFetch<SubscriptionChangeDto[]>(`/households/${householdId}/subscription/changes`),

  startTrial: (householdId: string, planId: string) => apiFetch<SubscriptionDto>(`/households/${householdId}/subscription/trial`, { method: "POST", body: { planId }, idempotencyKey: `trial-${householdId}-${planId}` }),

  subscribe: (householdId: string, input: SubscribeInput) =>
    apiFetch<SubscribeOutcome>(`/households/${householdId}/subscription/subscribe`, { method: "POST", body: input, idempotencyKey: `subscribe-${householdId}-${input.planId}-${Date.now()}` }),

  upgrade: (householdId: string, input: SubscribeInput) =>
    apiFetch<SubscribeOutcome>(`/households/${householdId}/subscription/upgrade`, { method: "POST", body: input, idempotencyKey: `upgrade-${householdId}-${input.planId}-${Date.now()}` }),

  scheduleDowngrade: (householdId: string, planId: string) => apiFetch<SubscriptionDto>(`/households/${householdId}/subscription/downgrade`, { method: "POST", body: { planId } }),

  cancel: (householdId: string) => apiFetch<SubscriptionDto>(`/households/${householdId}/subscription/cancel`, { method: "POST" }),

  resume: (householdId: string) => apiFetch<SubscriptionDto>(`/households/${householdId}/subscription/resume`, { method: "POST" }),
};
