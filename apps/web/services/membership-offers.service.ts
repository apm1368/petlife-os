import type { MembershipGiftOfferDto, MembershipOffersDto, StartFreeWeekResultDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

/** The free week and the first-purchase gift. Every decision (eligibility, length, percent) is the server's. */
export const membershipOffersService = {
  forHousehold: (householdId: string) => apiFetch<MembershipOffersDto>(`/households/${householdId}/subscription/offers`),
  /** Before a household exists (the first screen after sign-up). */
  forAccount: () => apiFetch<MembershipOffersDto>("/account/membership-offers"),
  /** One click; a repeat returns the running trial (`started: false`). */
  startFreeWeek: (householdId: string) => apiFetch<StartFreeWeekResultDto>(`/households/${householdId}/subscription/free-week`, { method: "POST", idempotencyKey: `free-week-${householdId}-${Date.now()}` }),
  checkGift: (householdId: string, code: string) => apiFetch<MembershipGiftOfferDto>(`/households/${householdId}/subscription/gift/check`, { method: "POST", body: { code } }),
};
