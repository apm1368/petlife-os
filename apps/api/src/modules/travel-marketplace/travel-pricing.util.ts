import type { PetPolicyMatchDto, TravelPriceBreakdownDto } from "@petlife/types";
import { toDateKey } from "./travel-date.util";

export interface RatePlanTerms {
  id: string;
  name: string;
  priceModifierPercent: number;
  cancellationType: "FREE_UNTIL" | "PARTIAL" | "NON_REFUNDABLE";
  freeCancellationDays: number | null;
  lateRefundPercent: number | null;
  paymentTiming: "PAY_NOW" | "DEPOSIT" | "PAY_AT_PROPERTY";
  depositPercent: number | null;
  includesBreakfast: boolean;
  includedItems: string[];
  minNights: number | null;
  activeFrom: Date | null;
  activeUntil: Date | null;
  isActive: boolean;
}

export interface PolicyTerms {
  dogsAllowed: boolean;
  catsAllowed: boolean;
  otherAllowed: boolean;
  maxPets: number | null;
  maxWeightKg: number | null;
  minWeightKg: number | null;
  petFeeIrr: number | null;
  depositIrr: number | null;
}

export interface PetFacts {
  id: string;
  name: string | null;
  species: string;
  weightKg: number | null;
}

/** A rate plan is sellable for a stay only when active, inside its window and long enough. */
export function ratePlanApplies(plan: RatePlanTerms, checkIn: Date, nights: number): boolean {
  if (!plan.isActive) return false;
  if (plan.activeFrom && checkIn < plan.activeFrom) return false;
  if (plan.activeUntil && checkIn > plan.activeUntil) return false;
  if (plan.minNights && nights < plan.minNights) return false;
  return true;
}

/**
 * The single price calculation for a stay. Nightly prices come from the
 * provider (per-date override or unit base); the rate plan adjusts them; the
 * pet fee is per pet per stay; the pet deposit is the provider's refundable
 * deposit and is shown separately so it is never hidden until checkout.
 */
export function priceStay(input: {
  nights: Date[];
  nightlyPriceIrr: Map<number, number>;
  basePriceIrr: number;
  plan: RatePlanTerms | null;
  policy: PolicyTerms | null;
  petCount: number;
}): TravelPriceBreakdownDto {
  const nightly = input.nights.map((night) => ({ date: toDateKey(night), priceIrr: input.nightlyPriceIrr.get(night.getTime()) ?? input.basePriceIrr }));
  const staySubtotalIrr = nightly.reduce((sum, n) => sum + n.priceIrr, 0);
  const modifier = input.plan?.priceModifierPercent ?? 0;
  const adjusted = Math.round((staySubtotalIrr * (100 + modifier)) / 100);
  const rateAdjustmentIrr = adjusted - staySubtotalIrr;
  const petFeeIrr = (input.policy?.petFeeIrr ?? 0) * input.petCount;
  const petDepositIrr = input.petCount > 0 ? (input.policy?.depositIrr ?? 0) : 0;
  const totalIrr = adjusted + petFeeIrr + petDepositIrr;
  const timing = input.plan?.paymentTiming ?? "PAY_NOW";
  const payNowIrr = timing === "PAY_AT_PROPERTY" ? 0 : timing === "DEPOSIT" ? Math.round((totalIrr * (input.plan?.depositPercent ?? 100)) / 100) : totalIrr;
  return { nightly, staySubtotalIrr, rateAdjustmentIrr, petFeeIrr, petDepositIrr, discountIrr: 0, totalIrr, payNowIrr, payLaterIrr: totalIrr - payNowIrr };
}

/**
 * Refund due under the booking's own snapshotted terms. A provider-side
 * cancellation always refunds everything paid.
 */
export function decideTravelRefund(
  plan: Pick<RatePlanTerms, "cancellationType" | "freeCancellationDays" | "lateRefundPercent"> | null,
  checkIn: Date,
  paidIrr: number,
  byProvider: boolean,
  now = new Date(),
): { percent: number; amountIrr: number; withinFreeWindow: boolean } {
  if (paidIrr <= 0) return { percent: 0, amountIrr: 0, withinFreeWindow: true };
  if (byProvider) return { percent: 100, amountIrr: paidIrr, withinFreeWindow: true };
  const type = plan?.cancellationType ?? "FREE_UNTIL";
  let percent = 0;
  let withinFreeWindow = false;
  if (type === "FREE_UNTIL") {
    const deadline = checkIn.getTime() - (plan?.freeCancellationDays ?? 0) * 86_400_000;
    withinFreeWindow = now.getTime() <= deadline;
    percent = withinFreeWindow ? 100 : (plan?.lateRefundPercent ?? 0);
  } else if (type === "PARTIAL") {
    percent = now < checkIn ? (plan?.lateRefundPercent ?? 0) : 0;
  }
  return { percent, amountIrr: Math.floor((paidIrr * percent) / 100), withinFreeWindow };
}

/**
 * Compares the traveller's pets with what the provider actually stated.
 * Only three outcomes, none of them a safety verdict:
 * - POTENTIAL_CONFLICT: a stated rule clearly does not fit (species, count, weight).
 * - MORE_INFO_NEEDED: the provider stated nothing, or a limit exists and the pet's data is missing.
 * - MATCH: every stated rule is known to fit.
 */
export function matchPetPolicy(policy: PolicyTerms | null, pets: PetFacts[]): PetPolicyMatchDto {
  const reasons: PetPolicyMatchDto["reasons"] = [];
  if (pets.length === 0) return { outcome: policy ? "MATCH" : "MORE_INFO_NEEDED", reasons: policy ? [] : [{ petId: null, petName: null, code: "POLICY_NOT_STATED" }] };
  if (!policy) return { outcome: "MORE_INFO_NEEDED", reasons: [{ petId: null, petName: null, code: "POLICY_NOT_STATED" }] };

  let conflict = false;
  let moreInfo = false;
  if (policy.maxPets !== null && pets.length > policy.maxPets) {
    conflict = true;
    reasons.push({ petId: null, petName: null, code: "TOO_MANY_PETS", detail: { maxPets: policy.maxPets, requested: pets.length } });
  }
  for (const pet of pets) {
    const allowed = pet.species === "DOG" ? policy.dogsAllowed : pet.species === "CAT" ? policy.catsAllowed : policy.otherAllowed;
    if (!allowed) {
      conflict = true;
      reasons.push({ petId: pet.id, petName: pet.name, code: "SPECIES_NOT_ACCEPTED", detail: { species: pet.species } });
      continue;
    }
    if (policy.maxWeightKg !== null || policy.minWeightKg !== null) {
      if (pet.weightKg === null) {
        moreInfo = true;
        reasons.push({ petId: pet.id, petName: pet.name, code: "WEIGHT_UNKNOWN", detail: { maxWeightKg: policy.maxWeightKg, minWeightKg: policy.minWeightKg } });
      } else if (policy.maxWeightKg !== null && pet.weightKg > policy.maxWeightKg) {
        conflict = true;
        reasons.push({ petId: pet.id, petName: pet.name, code: "OVER_MAX_WEIGHT", detail: { maxWeightKg: policy.maxWeightKg, weightKg: Math.round(pet.weightKg * 10) / 10 } });
      } else if (policy.minWeightKg !== null && pet.weightKg < policy.minWeightKg) {
        conflict = true;
        reasons.push({ petId: pet.id, petName: pet.name, code: "UNDER_MIN_WEIGHT", detail: { minWeightKg: policy.minWeightKg, weightKg: Math.round(pet.weightKg * 10) / 10 } });
      }
    }
  }
  return { outcome: conflict ? "POTENTIAL_CONFLICT" : moreInfo ? "MORE_INFO_NEEDED" : "MATCH", reasons };
}

export function toKg(value: unknown, unit: string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return unit === "LB" ? n * 0.45359237 : n;
}

/** Great-circle distance in km (display/sort only; geo search itself stays in PostGIS for places). */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
