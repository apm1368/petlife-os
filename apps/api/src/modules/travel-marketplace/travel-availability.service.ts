import { Injectable } from "@nestjs/common";
import { Prisma, TravelBookingStatus, TravelPricingMode } from "@prisma/client";
import type { TravelAvailabilityDayDto, TravelPriceBreakdownDto, TravelQuoteDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TravelInventoryUnitNotFoundException, TravelListingNotFoundException, ValidationApiException } from "../../common/errors/api-exception";
import { addDays, enumerateNights, resolveStayRange, toDateKey, toUtcMidnight } from "./travel-date.util";
import { matchPetPolicy, priceStay, ratePlanApplies, type PetFacts, type RatePlanTerms } from "./travel-pricing.util";

/**
 * Statuses that actually hold inventory. A booking in one of these owns its
 * TravelBookedNight rows; anything else (CANCELLED, REJECTED, EXPIRED,
 * REFUNDED, MODIFIED, NO_SHOW after release, DRAFT) has released them.
 * HELD is a bounded hold while the traveller completes the booking flow.
 */
export const INVENTORY_HOLDING_STATUSES: TravelBookingStatus[] = [
  TravelBookingStatus.HELD,
  TravelBookingStatus.AWAITING_PROVIDER,
  TravelBookingStatus.AWAITING_PAYMENT,
  TravelBookingStatus.CONFIRMED,
  TravelBookingStatus.IN_PROGRESS,
  TravelBookingStatus.COMPLETED,
];

export interface UnitNightState {
  remaining: Map<number, number>;
  price: Map<number, number>;
}

type Client = Prisma.TransactionClient | PrismaService;

/** Internal quote: the public DTO plus the rate plan terms and breakdown the booking snapshots. */
export interface TravelQuoteResult extends TravelQuoteDto {
  ratePlan: RatePlanTerms | null;
  breakdown: TravelPriceBreakdownDto;
}

/** Strips internal fields before a quote leaves the API. */
export function publicQuote(q: TravelQuoteResult): TravelQuoteDto {
  const { ratePlan: _plan, breakdown: _breakdown, ...dto } = q;
  void _plan;
  void _breakdown;
  return dto;
}

/**
 * Availability is computed from two real sources only — the provider's own
 * blocks/prices and the TravelBookedNight rows live bookings and holds own.
 * Nothing here invents a free date.
 */
@Injectable()
export class TravelAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Remaining slots and nightly price for many units over one range in two
   * queries total (no per-unit round trips) — used by search and detail.
   */
  async getNightStates(units: { id: string; quantity: number; isActive: boolean; basePriceIrr: number }[], nights: Date[], client: Client = this.prisma): Promise<Map<string, UnitNightState>> {
    const out = new Map<string, UnitNightState>();
    if (units.length === 0 || nights.length === 0) return out;
    const unitIds = units.map((u) => u.id);
    const [held, overrides] = await Promise.all([
      client.travelBookedNight.groupBy({ by: ["unitId", "night"], where: { unitId: { in: unitIds }, night: { in: nights } }, _count: { _all: true } }),
      client.travelAvailability.findMany({ where: { unitId: { in: unitIds }, date: { in: nights } }, select: { unitId: true, date: true, isBlocked: true, priceIrr: true } }),
    ]);
    const heldKey = new Map(held.map((h) => [`${h.unitId}:${h.night.getTime()}`, h._count._all]));
    const overrideKey = new Map(overrides.map((o) => [`${o.unitId}:${o.date.getTime()}`, o]));
    for (const unit of units) {
      const remaining = new Map<number, number>();
      const price = new Map<number, number>();
      for (const night of nights) {
        const key = `${unit.id}:${night.getTime()}`;
        const override = overrideKey.get(key);
        price.set(night.getTime(), override?.priceIrr ?? unit.basePriceIrr);
        // A provider block takes the whole night off the market regardless of free slots.
        remaining.set(night.getTime(), !unit.isActive || override?.isBlocked ? 0 : Math.max(0, unit.quantity - (heldKey.get(key) ?? 0)));
      }
      out.set(unit.id, { remaining, price });
    }
    return out;
  }

  async getRemainingByNight(unitId: string, nights: Date[], tx?: Prisma.TransactionClient): Promise<Map<number, number>> {
    const client = tx ?? this.prisma;
    const unit = await client.travelInventoryUnit.findUnique({ where: { id: unitId }, select: { id: true, quantity: true, isActive: true, basePriceIrr: true } });
    if (!unit) throw new TravelInventoryUnitNotFoundException({ unitId });
    return (await this.getNightStates([unit], nights, client)).get(unitId)!.remaining;
  }

  /** The public calendar for one unit: one row per date with real bookability and price (capped at 62 days). */
  async getUnitCalendar(unitId: string, fromDateInput: string, toDateInput: string): Promise<TravelAvailabilityDayDto[]> {
    const unit = await this.prisma.travelInventoryUnit.findUnique({ where: { id: unitId }, select: { id: true, quantity: true, isActive: true, basePriceIrr: true } });
    if (!unit) throw new TravelInventoryUnitNotFoundException({ unitId });
    const from = toUtcMidnight(fromDateInput);
    const to = addDays(toUtcMidnight(toDateInput), 1);
    const nights = enumerateNights(from, to);
    if (nights.length === 0) return [];
    if (nights.length > 62) throw new ValidationApiException({ field: "to", reason: "CALENDAR_RANGE_TOO_LONG", maxDays: 62 });
    const state = (await this.getNightStates([unit], nights)).get(unit.id)!;
    return nights.map((night) => ({
      date: toDateKey(night),
      isAvailable: (state.remaining.get(night.getTime()) ?? 0) > 0,
      priceIrr: state.price.get(night.getTime()) ?? unit.basePriceIrr,
      remaining: state.remaining.get(night.getTime()) ?? 0,
    }));
  }

  /**
   * Prices a specific stay for one unit and rate plan. Always server-side:
   * the client's quote is a display value, and booking re-runs this inside
   * its transaction so a stale or tampered price is never the price of record.
   */
  async quote(
    listingId: string,
    unitId: string,
    checkInInput: string,
    checkOutInput: string,
    pets: PetFacts[] = [],
    ratePlanId?: string | null,
    client: Client = this.prisma,
  ): Promise<TravelQuoteResult> {
    const listing = await client.travelListing.findUnique({ where: { id: listingId }, select: { pricingMode: true, petPolicy: true } });
    if (!listing) throw new TravelListingNotFoundException({ listingId });
    const unit = await client.travelInventoryUnit.findFirst({ where: { id: unitId, listingId }, include: { ratePlans: true } });
    if (!unit) throw new TravelInventoryUnitNotFoundException({ unitId, listingId });

    const perTrip = listing.pricingMode === TravelPricingMode.PER_TRIP;
    const { checkIn, checkOut, nights } = resolveStayRange(checkInInput, checkOutInput, perTrip);

    let plan: RatePlanTerms | null = null;
    if (ratePlanId) {
      plan = unit.ratePlans.find((p) => p.id === ratePlanId) ?? null;
      if (!plan) throw new ValidationApiException({ field: "ratePlanId", reason: "RATE_PLAN_NOT_FOUND" });
      if (!ratePlanApplies(plan, checkIn, nights.length)) throw new ValidationApiException({ field: "ratePlanId", reason: "RATE_PLAN_NOT_AVAILABLE_FOR_STAY", minNights: plan.minNights });
    } else if (unit.ratePlans.some((p) => p.isActive)) {
      // A unit sold through rate plans cannot be booked without choosing one.
      throw new ValidationApiException({ field: "ratePlanId", reason: "RATE_PLAN_REQUIRED" });
    }

    const state = (await this.getNightStates([unit], nights, client)).get(unit.id)!;
    const unavailable = nights.find((night) => (state.remaining.get(night.getTime()) ?? 0) <= 0);
    const breakdown = priceStay({ nights, nightlyPriceIrr: state.price, basePriceIrr: unit.basePriceIrr, plan, policy: listing.petPolicy, petCount: pets.length });
    const petPolicyMatch = pets.length ? matchPetPolicy(listing.petPolicy, pets) : null;
    if (petPolicyMatch && unit.maxPets !== null && pets.length > unit.maxPets) {
      petPolicyMatch.outcome = "POTENTIAL_CONFLICT";
      petPolicyMatch.reasons.push({ petId: null, petName: null, code: "UNIT_PET_LIMIT", detail: { maxPets: unit.maxPets } });
    }

    return {
      listingId,
      unitId,
      checkIn: toDateKey(checkIn),
      checkOut: toDateKey(checkOut),
      nights: nights.length,
      isBookable: unavailable === undefined,
      unavailableDate: unavailable ? toDateKey(unavailable) : null,
      baseAmountIrr: breakdown.staySubtotalIrr + breakdown.rateAdjustmentIrr,
      petFeeAmountIrr: breakdown.petFeeIrr,
      depositAmountIrr: breakdown.petDepositIrr,
      totalAmountIrr: breakdown.totalIrr,
      ratePlanId: plan?.id ?? null,
      discountAmountIrr: breakdown.discountIrr,
      payNowAmountIrr: breakdown.payNowIrr,
      payLaterAmountIrr: breakdown.payLaterIrr,
      nightly: breakdown.nightly,
      petPolicyMatch,
      ratePlan: plan,
      breakdown,
    };
  }
}
