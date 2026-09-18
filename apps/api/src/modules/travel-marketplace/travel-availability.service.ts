import { Injectable } from "@nestjs/common";
import { Prisma, TravelBookingStatus, TravelPricingMode } from "@prisma/client";
import type { TravelAvailabilityDayDto, TravelQuoteDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TravelInventoryUnitNotFoundException, TravelListingNotFoundException } from "../../common/errors/api-exception";
import { addDays, enumerateNights, resolveStayRange, toDateKey, toUtcMidnight } from "./travel-date.util";

/**
 * Statuses that actually hold inventory. A booking in one of these owns its
 * TravelBookedNight rows; anything else (CANCELLED, REJECTED, EXPIRED,
 * REFUNDED, DRAFT) has released them, so the night is genuinely free again.
 */
export const INVENTORY_HOLDING_STATUSES: TravelBookingStatus[] = [
  TravelBookingStatus.AWAITING_PROVIDER,
  TravelBookingStatus.AWAITING_PAYMENT,
  TravelBookingStatus.CONFIRMED,
  TravelBookingStatus.IN_PROGRESS,
  TravelBookingStatus.COMPLETED,
];

/**
 * Availability is computed from two real sources only — the provider's own
 * blocks/prices and the TravelBookedNight rows live bookings hold. Nothing
 * here invents a free date: a listing with no provider inventory returns an
 * empty calendar rather than a plausible-looking one.
 */
@Injectable()
export class TravelAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * How many slots of a unit are still free on each night of a range.
   * A unit with `quantity` 3 holding 1 booked night has 2 remaining.
   */
  async getRemainingByNight(unitId: string, nights: Date[], tx?: Prisma.TransactionClient): Promise<Map<number, number>> {
    const client = tx ?? this.prisma;
    const unit = await client.travelInventoryUnit.findUnique({ where: { id: unitId }, select: { quantity: true, isActive: true } });
    if (!unit) throw new TravelInventoryUnitNotFoundException({ unitId });

    const held = await client.travelBookedNight.groupBy({
      by: ["night"],
      where: { unitId, night: { in: nights } },
      _count: { _all: true },
    });
    const heldByNight = new Map(held.map((row) => [row.night.getTime(), row._count._all]));

    const blocked = await client.travelAvailability.findMany({
      where: { unitId, date: { in: nights }, isBlocked: true },
      select: { date: true },
    });
    const blockedNights = new Set(blocked.map((row) => row.date.getTime()));

    const remaining = new Map<number, number>();
    for (const night of nights) {
      const key = night.getTime();
      // A provider block takes the whole night off the market regardless of
      // how many slots are otherwise free — it is an explicit "not bookable".
      if (!unit.isActive || blockedNights.has(key)) remaining.set(key, 0);
      else remaining.set(key, Math.max(0, unit.quantity - (heldByNight.get(key) ?? 0)));
    }
    return remaining;
  }

  /** The provider's per-date price overrides, falling back to the unit base price. */
  private async getPriceByNight(unitId: string, basePriceIrr: number, nights: Date[]): Promise<Map<number, number>> {
    const overrides = await this.prisma.travelAvailability.findMany({
      where: { unitId, date: { in: nights }, priceIrr: { not: null } },
      select: { date: true, priceIrr: true },
    });
    const byNight = new Map(overrides.map((row) => [row.date.getTime(), row.priceIrr as number]));
    return new Map(nights.map((night) => [night.getTime(), byNight.get(night.getTime()) ?? basePriceIrr]));
  }

  /** The public calendar for one unit: one row per date, each with its real bookability and price. */
  async getUnitCalendar(unitId: string, fromDateInput: string, toDateInput: string): Promise<TravelAvailabilityDayDto[]> {
    const unit = await this.prisma.travelInventoryUnit.findUnique({ where: { id: unitId }, select: { basePriceIrr: true } });
    if (!unit) throw new TravelInventoryUnitNotFoundException({ unitId });

    const from = toUtcMidnight(fromDateInput);
    // The calendar is inclusive of its end date, unlike a stay range.
    const to = addDays(toUtcMidnight(toDateInput), 1);
    const nights = enumerateNights(from, to);
    if (nights.length === 0) return [];

    const [remaining, prices] = await Promise.all([this.getRemainingByNight(unitId, nights), this.getPriceByNight(unitId, unit.basePriceIrr, nights)]);

    return nights.map((night) => ({
      date: toDateKey(night),
      isAvailable: (remaining.get(night.getTime()) ?? 0) > 0,
      priceIrr: prices.get(night.getTime()) ?? unit.basePriceIrr,
      remaining: remaining.get(night.getTime()) ?? 0,
    }));
  }

  /**
   * Prices a specific stay. Always server-side: the client's copy of a quote
   * is a display value, and TravelBookingService re-runs this before writing
   * a booking so a stale or tampered price is never the price of record.
   */
  async quote(listingId: string, unitId: string, checkInInput: string, checkOutInput: string, petCount = 0): Promise<TravelQuoteDto> {
    const listing = await this.prisma.travelListing.findUnique({
      where: { id: listingId },
      select: { pricingMode: true, petPolicy: { select: { petFeeIrr: true, depositIrr: true } } },
    });
    if (!listing) throw new TravelListingNotFoundException({ listingId });

    const unit = await this.prisma.travelInventoryUnit.findFirst({ where: { id: unitId, listingId }, select: { basePriceIrr: true } });
    if (!unit) throw new TravelInventoryUnitNotFoundException({ unitId, listingId });

    const perTrip = listing.pricingMode === TravelPricingMode.PER_TRIP;
    const { checkIn, checkOut, nights } = resolveStayRange(checkInInput, checkOutInput, perTrip);

    const [remaining, prices] = await Promise.all([this.getRemainingByNight(unitId, nights), this.getPriceByNight(unitId, unit.basePriceIrr, nights)]);

    const unavailable = nights.find((night) => (remaining.get(night.getTime()) ?? 0) <= 0);
    const baseAmountIrr = nights.reduce((sum, night) => sum + (prices.get(night.getTime()) ?? unit.basePriceIrr), 0);

    // The pet fee is per pet per stay, and the deposit is per stay — both are
    // the provider's own stated amounts, never a PET LIFE markup.
    const petFeeAmountIrr = (listing.petPolicy?.petFeeIrr ?? 0) * petCount;
    const depositAmountIrr = petCount > 0 ? (listing.petPolicy?.depositIrr ?? 0) : 0;

    return {
      listingId,
      unitId,
      checkIn: toDateKey(checkIn),
      checkOut: toDateKey(checkOut),
      nights: nights.length,
      isBookable: unavailable === undefined,
      unavailableDate: unavailable ? toDateKey(unavailable) : null,
      baseAmountIrr,
      petFeeAmountIrr,
      depositAmountIrr,
      totalAmountIrr: baseAmountIrr + petFeeAmountIrr + depositAmountIrr,
    };
  }
}
