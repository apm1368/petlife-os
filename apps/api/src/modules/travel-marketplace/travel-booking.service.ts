import { Injectable } from "@nestjs/common";
import { randomInt } from "node:crypto";
import { Prisma, TravelBookingMode, TravelBookingStatus, TravelListingStatus, TravelPricingMode } from "@prisma/client";
import type { PaginatedDto, TravelBookingDto, TripTravelSummaryDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import {
  InvalidTravelBookingTransitionException,
  NotFoundApiException,
  TravelBookingAccessDeniedException,
  TravelBookingNotFoundException,
  TravelDatesUnavailableException,
  TravelInventoryUnitNotFoundException,
  TravelListingNotFoundException,
  TravelPetPolicyViolationException,
  TripNotFoundException,
} from "../../common/errors/api-exception";
import { BOOKING_INCLUDE, toTravelBookingDto } from "./travel-marketplace-mapper";
import { INVENTORY_HOLDING_STATUSES, TravelAvailabilityService } from "./travel-availability.service";
import { resolveStayRange, toDateKey } from "./travel-date.util";
import type { CreateTravelBookingDto } from "./dto/travel-marketplace.dto";

/** Statuses the traveller may leave from, and where to. */
const TRAVELER_TRANSITIONS: Partial<Record<TravelBookingStatus, TravelBookingStatus[]>> = {
  [TravelBookingStatus.AWAITING_PROVIDER]: [TravelBookingStatus.CANCELLED],
  [TravelBookingStatus.AWAITING_PAYMENT]: [TravelBookingStatus.CANCELLED],
  [TravelBookingStatus.CONFIRMED]: [TravelBookingStatus.CANCELLED],
};

/** Statuses the provider may act on, and where to. */
const PROVIDER_TRANSITIONS: Partial<Record<TravelBookingStatus, TravelBookingStatus[]>> = {
  [TravelBookingStatus.AWAITING_PROVIDER]: [TravelBookingStatus.CONFIRMED, TravelBookingStatus.REJECTED],
  [TravelBookingStatus.CONFIRMED]: [TravelBookingStatus.IN_PROGRESS, TravelBookingStatus.CANCELLED],
  [TravelBookingStatus.IN_PROGRESS]: [TravelBookingStatus.COMPLETED],
};

/** Statuses whose TravelBookedNight holds must be released when entering them. */
const RELEASING_STATUSES: TravelBookingStatus[] = [
  TravelBookingStatus.CANCELLED,
  TravelBookingStatus.REJECTED,
  TravelBookingStatus.EXPIRED,
  TravelBookingStatus.REFUNDED,
];

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Ambiguous characters (0/O, 1/I) are excluded so a reference read aloud to support lands correctly. */
function generateReference(): string {
  let suffix = "";
  for (let i = 0; i < 8; i += 1) suffix += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return `TR-${suffix}`;
}

/**
 * Handoff 23 — the travel marketplace's demand side.
 *
 * The single most important guarantee here is that a confirmed booking holds
 * real inventory: every live booking owns one TravelBookedNight row per
 * (unit, night, slot), and `@@unique([unitId, night, slot])` means two racing
 * requests for the last room cannot both succeed. The loser gets
 * TRAVEL_DATES_UNAVAILABLE — it never becomes an oversell the provider
 * discovers at check-in.
 *
 * No money moves here. A booking records IRR amounts the provider set, and
 * payment stays out of scope for this handoff (the AWAITING_PAYMENT state
 * exists for when H07's payment core is wired in, and is never entered by
 * pretending a payment succeeded).
 */
@Injectable()
export class TravelBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly availability: TravelAvailabilityService,
  ) {}

  // --- Creation -------------------------------------------------------------

  async create(householdId: string, userId: string, listingId: string, input: CreateTravelBookingDto): Promise<TravelBookingDto> {
    const listing = await this.prisma.travelListing.findFirst({
      where: { id: listingId, status: TravelListingStatus.PUBLISHED, isPubliclyListed: true },
      include: { petPolicy: true },
    });
    if (!listing) throw new TravelListingNotFoundException({ listingId });

    const unit = await this.prisma.travelInventoryUnit.findFirst({ where: { id: input.unitId, listingId, isActive: true } });
    if (!unit) throw new TravelInventoryUnitNotFoundException({ unitId: input.unitId, listingId });

    const perTrip = listing.pricingMode === TravelPricingMode.PER_TRIP;
    const { checkIn, checkOut, nights } = resolveStayRange(input.checkIn, input.checkOut, perTrip);

    const petIds = input.petIds ?? [];
    const pets = await this.loadHouseholdPets(householdId, petIds);
    this.assertPetPolicySatisfied(listing.petPolicy, pets);

    if (input.tripId) await this.assertTripBelongsToHousehold(input.tripId, householdId);

    // Price is always re-derived server-side — the client never supplies it.
    const quote = await this.availability.quote(listingId, unit.id, toDateKey(checkIn), toDateKey(checkOut), pets.length);
    if (!quote.isBookable) throw new TravelDatesUnavailableException({ listingId, unitId: unit.id, unavailableDate: quote.unavailableDate });

    // INSTANT_BOOKING confirms on the spot; REQUEST_TO_BOOK waits for the
    // provider. Both hold inventory immediately — a pending request that did
    // not hold its nights would let the same room be requested twice over.
    const status = listing.bookingMode === TravelBookingMode.INSTANT_BOOKING ? TravelBookingStatus.CONFIRMED : TravelBookingStatus.AWAITING_PROVIDER;

    const created = await this.prisma.$transaction(async (tx) => {
      const booking = await tx.travelBooking.create({
        data: {
          listingId,
          unitId: unit.id,
          reference: generateReference(),
          householdId,
          bookedByUserId: userId,
          tripId: input.tripId ?? null,
          status,
          checkIn,
          checkOut,
          guests: input.guests ?? 1,
          nights: quote.nights,
          baseAmountIrr: quote.baseAmountIrr,
          petFeeAmountIrr: quote.petFeeAmountIrr,
          depositAmountIrr: quote.depositAmountIrr,
          totalAmountIrr: quote.totalAmountIrr,
          cancellationPolicySnapshot: listing.cancellationPolicy,
          travelerNote: input.travelerNote ?? null,
          confirmedAt: status === TravelBookingStatus.CONFIRMED ? new Date() : null,
          pets: { create: petIds.map((petId) => ({ petId })) },
        },
        include: BOOKING_INCLUDE,
      });

      await this.holdNights(tx, unit.id, booking.id, nights, unit.quantity);

      await this.events.publish("TravelBookingRequested", { bookingId: booking.id, listingId, householdId, status }, { tx });
      if (status === TravelBookingStatus.CONFIRMED) {
        await this.events.publish("TravelBookingConfirmed", { bookingId: booking.id, listingId, householdId }, { tx });
      }
      return booking;
    });

    return toTravelBookingDto(created);
  }

  /**
   * Claims one slot per night. The slot search is what turns the unique
   * constraint into a capacity limit: for a unit with `quantity` 3, slots 0-2
   * are tried in order and a night with all three taken has nowhere left to
   * insert. A concurrent transaction that already claimed the same slot makes
   * this insert fail with P2002, which surfaces as TRAVEL_DATES_UNAVAILABLE
   * rather than a second booking on the same room.
   */
  private async holdNights(tx: Prisma.TransactionClient, unitId: string, bookingId: string, nights: Date[], quantity: number): Promise<void> {
    for (const night of nights) {
      const taken = await tx.travelBookedNight.findMany({ where: { unitId, night }, select: { slot: true } });
      const takenSlots = new Set(taken.map((row) => row.slot));
      const slot = Array.from({ length: quantity }, (_, index) => index).find((candidate) => !takenSlots.has(candidate));
      if (slot === undefined) throw new TravelDatesUnavailableException({ unitId, night: toDateKey(night), reason: "NO_SLOT_REMAINING" });

      try {
        await tx.travelBookedNight.create({ data: { unitId, bookingId, night, slot } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new TravelDatesUnavailableException({ unitId, night: toDateKey(night), reason: "CONCURRENT_BOOKING" });
        }
        throw error;
      }
    }
  }

  private async loadHouseholdPets(householdId: string, petIds: string[]) {
    if (petIds.length === 0) return [];
    const rows = await this.prisma.pet.findMany({
      where: { id: { in: petIds }, householdId },
      select: { id: true, species: true, latestWeightValue: true, latestWeightUnit: true, breed: true },
    });
    // The provider states limits in kg, so a pound-recorded weight is converted
    // rather than compared raw — a 30 lb dog is not a 30 kg dog.
    const pets = rows.map((row) => ({
      id: row.id,
      species: row.species as string,
      weightKg:
        row.latestWeightValue === null
          ? null
          : row.latestWeightUnit === "LB"
            ? Number(row.latestWeightValue) * 0.45359237
            : Number(row.latestWeightValue),
    }));
    // A pet id the household does not own is never silently dropped.
    if (rows.length !== petIds.length) throw new NotFoundApiException("Pet");
    return pets;
  }

  /**
   * Checks the traveller's pets against the provider's stated policy. A listing
   * with no policy row has stated nothing, so nothing is enforced — PET LIFE
   * never invents a restriction the provider did not write down.
   */
  private assertPetPolicySatisfied(
    policy: { dogsAllowed: boolean; catsAllowed: boolean; otherAllowed: boolean; maxPets: number | null; maxWeightKg: number | null; minWeightKg: number | null } | null,
    pets: Array<{ id: string; species: string; weightKg: number | null }>,
  ): void {
    if (!policy || pets.length === 0) return;

    if (policy.maxPets !== null && pets.length > policy.maxPets) {
      throw new TravelPetPolicyViolationException({ reason: "TOO_MANY_PETS", maxPets: policy.maxPets, requested: pets.length });
    }

    for (const pet of pets) {
      const speciesAllowed = pet.species === "DOG" ? policy.dogsAllowed : pet.species === "CAT" ? policy.catsAllowed : policy.otherAllowed;
      if (!speciesAllowed) throw new TravelPetPolicyViolationException({ reason: "SPECIES_NOT_ACCEPTED", petId: pet.id, species: pet.species });

      // An unknown weight is never treated as a violation — the traveller is
      // not blocked because their pet's weight has not been recorded.
      if (pet.weightKg === null) continue;
      if (policy.maxWeightKg !== null && pet.weightKg > policy.maxWeightKg) {
        throw new TravelPetPolicyViolationException({ reason: "OVER_MAX_WEIGHT", petId: pet.id, maxWeightKg: policy.maxWeightKg });
      }
      if (policy.minWeightKg !== null && pet.weightKg < policy.minWeightKg) {
        throw new TravelPetPolicyViolationException({ reason: "UNDER_MIN_WEIGHT", petId: pet.id, minWeightKg: policy.minWeightKg });
      }
    }
  }

  private async assertTripBelongsToHousehold(tripId: string, householdId: string): Promise<void> {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, householdId }, select: { id: true } });
    if (!trip) throw new TripNotFoundException({ tripId });
  }

  // --- Traveller reads ------------------------------------------------------

  async listForHousehold(householdId: string, query: { page?: number; pageSize?: number; status?: string }): Promise<PaginatedDto<TravelBookingDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.TravelBookingWhereInput = {
      householdId,
      ...(query.status && query.status in TravelBookingStatus ? { status: query.status as TravelBookingStatus } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.travelBooking.findMany({ where, include: BOOKING_INCLUDE, orderBy: { checkIn: "desc" }, skip, take }),
      this.prisma.travelBooking.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toTravelBookingDto), total, page, pageSize);
  }

  async getForHousehold(bookingId: string, householdId: string): Promise<TravelBookingDto> {
    const row = await this.prisma.travelBooking.findUnique({ where: { id: bookingId }, include: BOOKING_INCLUDE });
    if (!row) throw new TravelBookingNotFoundException({ bookingId });
    if (row.householdId !== householdId) throw new TravelBookingAccessDeniedException({ bookingId });
    return toTravelBookingDto(row);
  }

  /** The Trip hub's travel section — read live, never a stored copy on the Trip. */
  async getTripTravelSummary(tripId: string, householdId: string): Promise<TripTravelSummaryDto> {
    await this.assertTripBelongsToHousehold(tripId, householdId);
    const rows = await this.prisma.travelBooking.findMany({ where: { tripId, householdId }, include: BOOKING_INCLUDE, orderBy: { checkIn: "asc" } });
    const bookings = rows.map(toTravelBookingDto);
    const active = rows.filter((row) => INVENTORY_HOLDING_STATUSES.includes(row.status) && row.status !== TravelBookingStatus.COMPLETED);
    return {
      tripId,
      bookings,
      activeCount: active.length,
      totalCommittedIrr: active.reduce((sum, row) => sum + row.totalAmountIrr, 0),
    };
  }

  async attachToTrip(bookingId: string, householdId: string, tripId: string): Promise<TravelBookingDto> {
    await this.getForHousehold(bookingId, householdId);
    await this.assertTripBelongsToHousehold(tripId, householdId);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.travelBooking.update({ where: { id: bookingId }, data: { tripId }, include: BOOKING_INCLUDE });
      await this.events.publish("TravelBookingAttachedToTrip", { bookingId, tripId, householdId }, { tx });
      return updated;
    });
    return toTravelBookingDto(row);
  }

  // --- Transitions ----------------------------------------------------------

  async cancelAsTraveler(bookingId: string, householdId: string, reason?: string): Promise<TravelBookingDto> {
    const row = await this.prisma.travelBooking.findUnique({ where: { id: bookingId }, select: { householdId: true, status: true } });
    if (!row) throw new TravelBookingNotFoundException({ bookingId });
    if (row.householdId !== householdId) throw new TravelBookingAccessDeniedException({ bookingId });
    return this.transition(bookingId, row.status, TravelBookingStatus.CANCELLED, TRAVELER_TRANSITIONS, { travelerNote: reason });
  }

  async respondAsProvider(bookingId: string, organizationId: string, target: TravelBookingStatus, providerNote?: string): Promise<TravelBookingDto> {
    const row = await this.prisma.travelBooking.findUnique({
      where: { id: bookingId },
      select: { status: true, listing: { select: { organizationId: true } } },
    });
    if (!row) throw new TravelBookingNotFoundException({ bookingId });
    if (row.listing.organizationId !== organizationId) throw new TravelBookingAccessDeniedException({ bookingId });
    return this.transition(bookingId, row.status, target, PROVIDER_TRANSITIONS, { providerNote });
  }

  private async transition(
    bookingId: string,
    from: TravelBookingStatus,
    to: TravelBookingStatus,
    table: Partial<Record<TravelBookingStatus, TravelBookingStatus[]>>,
    notes: { providerNote?: string; travelerNote?: string },
  ): Promise<TravelBookingDto> {
    if (!(table[from] ?? []).includes(to)) throw new InvalidTravelBookingTransitionException({ bookingId, from, to });

    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.travelBooking.update({
        where: { id: bookingId },
        data: {
          status: to,
          ...(notes.providerNote !== undefined ? { providerNote: notes.providerNote } : {}),
          ...(notes.travelerNote !== undefined ? { travelerNote: notes.travelerNote } : {}),
          ...(to === TravelBookingStatus.CONFIRMED ? { confirmedAt: now, respondedAt: now } : {}),
          ...(to === TravelBookingStatus.REJECTED ? { respondedAt: now } : {}),
          ...(to === TravelBookingStatus.CANCELLED ? { cancelledAt: now } : {}),
          ...(to === TravelBookingStatus.COMPLETED ? { completedAt: now } : {}),
        },
        include: BOOKING_INCLUDE,
      });

      // Releasing the held nights is what puts the dates back on the market.
      // Doing it in the same transaction as the status change means a night is
      // never both released and still held by a live booking.
      if (RELEASING_STATUSES.includes(to)) {
        await tx.travelBookedNight.deleteMany({ where: { bookingId } });
      }

      const eventName =
        to === TravelBookingStatus.CONFIRMED
          ? "TravelBookingConfirmed"
          : to === TravelBookingStatus.REJECTED
            ? "TravelBookingRejected"
            : to === TravelBookingStatus.CANCELLED
              ? "TravelBookingCancelled"
              : to === TravelBookingStatus.COMPLETED
                ? "TravelBookingCompleted"
                : null;
      if (eventName) await this.events.publish(eventName, { bookingId, from, to }, { tx });

      return updated;
    });

    return toTravelBookingDto(row);
  }

  // --- Provider reads -------------------------------------------------------

  async listForOrganization(organizationId: string, query: { page?: number; pageSize?: number; status?: string }): Promise<PaginatedDto<TravelBookingDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.TravelBookingWhereInput = {
      listing: { organizationId },
      ...(query.status && query.status in TravelBookingStatus ? { status: query.status as TravelBookingStatus } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.travelBooking.findMany({ where, include: BOOKING_INCLUDE, orderBy: { checkIn: "asc" }, skip, take }),
      this.prisma.travelBooking.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toTravelBookingDto), total, page, pageSize);
  }
}
