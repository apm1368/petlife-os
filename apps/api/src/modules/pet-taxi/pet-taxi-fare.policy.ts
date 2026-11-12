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

type Box = { south: number | null; west: number | null; north: number | null; east: number | null };
const hasBox = (r: Box): r is { south: number; west: number; north: number; east: number } => r.south != null && r.west != null && r.north != null && r.east != null;

/**
 * The rule for where the pickup actually is: the active city rule whose bounding box holds the point (the smallest box
 * when they overlap), else the active "*" default. The member's typed city never chooses the fare.
 */
export function pickRuleForPoint<T extends { city: string; active: boolean } & Box>(rules: T[], point: { latitude: number; longitude: number }): T | null {
  const inside = rules
    .filter((r) => r.active && r.city !== "*" && hasBox(r) && point.latitude >= r.south! && point.latitude <= r.north! && point.longitude >= r.west! && point.longitude <= r.east!)
    .sort((a, b) => (a.north! - a.south!) * (a.east! - a.west!) - (b.north! - b.south!) * (b.east! - b.west!));
  return inside[0] ?? rules.find((r) => r.active && r.city === "*") ?? null;
}

/** A city rule's box: south < north, west < east, at most ~3° either way (one city or metro area). */
export function validCityBox(b: Box): boolean {
  if (!hasBox(b)) return false;
  return b.south < b.north && b.west < b.east && b.north - b.south <= 3 && b.east - b.west <= 3 && b.south >= -90 && b.north <= 90 && b.west >= -180 && b.east <= 180;
}

/** ~500 m grid: what a driver sees of a pickup or drop-off before accepting. */
export const approximate = (value: number) => Math.round(Math.round(value / 0.005) * 0.005 * 1000) / 1000;
