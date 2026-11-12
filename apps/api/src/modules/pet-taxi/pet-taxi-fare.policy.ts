import type { PetTaxiCarrierSize, PetTaxiFareRule } from "@prisma/client";

export type FareRule = Pick<PetTaxiFareRule, "city" | "baseFareIrr" | "perKmIrr" | "perMinuteIrr" | "minimumFareIrr" | "mediumSurchargePercent" | "largeSurchargePercent" | "extraPetIrr">;

export interface FareBreakdown {
  baseIrr: number;
  distanceIrr: number;
  timeIrr: number;
  carrierIrr: number;
  extraPetsIrr: number;
  minimumApplied: boolean;
  km: number;
  minutes: number;
}

/** Round up to the next 1,000 toman, as taxi fares are quoted. */
const roundUp = (irr: number) => Math.ceil(irr / 10_000) * 10_000;

/**
 * base + per km + per minute; the carrier surcharge is a percentage of the distance-and-time part (a crate in the
 * boot costs more the longer the trip); each pet after the first adds a fixed amount; never below the minimum.
 */
export function computeFare(rule: FareRule, route: { distanceMeters: number; durationSeconds: number }, carrierSize: PetTaxiCarrierSize, petCount: number): { fareIrr: number; breakdown: FareBreakdown } {
  const km = route.distanceMeters / 1000;
  const minutes = route.durationSeconds / 60;
  const distanceIrr = Math.round(rule.perKmIrr * km);
  const timeIrr = Math.round(rule.perMinuteIrr * minutes);
  const percent = carrierSize === "LARGE" ? rule.largeSurchargePercent : carrierSize === "MEDIUM" ? rule.mediumSurchargePercent : 0;
  const carrierIrr = Math.round(((distanceIrr + timeIrr) * percent) / 100);
  const extraPetsIrr = Math.max(0, petCount - 1) * rule.extraPetIrr;
  const raw = rule.baseFareIrr + distanceIrr + timeIrr + carrierIrr + extraPetsIrr;
  const minimumApplied = raw < rule.minimumFareIrr;
  return {
    fareIrr: roundUp(Math.max(raw, rule.minimumFareIrr)),
    breakdown: { baseIrr: rule.baseFareIrr, distanceIrr, timeIrr, carrierIrr, extraPetsIrr, minimumApplied, km: Math.round(km * 10) / 10, minutes: Math.round(minutes) },
  };
}

export const normalizeCity = (city: string | null | undefined) => (city ?? "").trim().replace(/\s+/g, " ").replace(/ي/g, "ی").replace(/ك/g, "ک");

/** The rule for the pickup city, else the "*" default. */
export function pickRule<T extends { city: string; active: boolean }>(rules: T[], city: string | null | undefined): T | null {
  const wanted = normalizeCity(city);
  return rules.find((r) => r.active && wanted && normalizeCity(r.city) === wanted) ?? rules.find((r) => r.active && r.city === "*") ?? null;
}
