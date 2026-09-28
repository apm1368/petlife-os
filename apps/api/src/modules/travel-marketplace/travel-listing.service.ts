import { Injectable } from "@nestjs/common";
import { Prisma, TravelListingStatus, TravelPricingMode } from "@prisma/client";
import type { PaginatedDto, TravelListingDto, TravelProviderCalendarDto, TravelProviderFinanceDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import {
  InvalidTravelListingTransitionException,
  TravelInventoryUnitNotFoundException,
  TravelListingAccessDeniedException,
  TravelListingNotFoundException,
  NotFoundApiException,
  ValidationApiException,
} from "../../common/errors/api-exception";
import { LISTING_INCLUDE, toTravelListingDto } from "./travel-marketplace-mapper";
import { TravelAvailabilityService } from "./travel-availability.service";
import { enumerateNights, toDateKey, toUtcMidnight, addDays } from "./travel-date.util";
import type {
  CreateTravelInventoryUnitDto,
  CreateTravelListingDto,
  SearchTravelListingsQueryDto,
  SetTravelAvailabilityDto,
  UpdateTravelInventoryUnitDto,
  UpdateTravelListingDto,
  UpsertTravelPetPolicyDto,
  RatePlanInputDto,
  TravelMediaInputDto,
} from "./dto/travel-marketplace.dto";

/**
 * Provider-driven lifecycle. A provider can send a listing to review and pull
 * it back, but only an admin moves it to PUBLISHED or SUSPENDED — the same
 * separation the Animal Support classifieds board uses.
 */
const PROVIDER_TRANSITIONS: Record<TravelListingStatus, TravelListingStatus[]> = {
  [TravelListingStatus.DRAFT]: [TravelListingStatus.PENDING_REVIEW, TravelListingStatus.ARCHIVED],
  [TravelListingStatus.PENDING_REVIEW]: [TravelListingStatus.DRAFT, TravelListingStatus.ARCHIVED],
  [TravelListingStatus.PUBLISHED]: [TravelListingStatus.ARCHIVED],
  // A suspended listing goes back to the provider to fix and resubmit.
  [TravelListingStatus.SUSPENDED]: [TravelListingStatus.PENDING_REVIEW, TravelListingStatus.ARCHIVED],
  [TravelListingStatus.ARCHIVED]: [TravelListingStatus.DRAFT],
};

/** Content stays editable until it is live; a published listing's copy is edited in place but re-reviewed by admins. */
const EDITABLE_STATUSES: TravelListingStatus[] = [
  TravelListingStatus.DRAFT,
  TravelListingStatus.PENDING_REVIEW,
  TravelListingStatus.PUBLISHED,
  TravelListingStatus.SUSPENDED,
];

/**
 * Handoff 23 — the travel marketplace's supply side.
 *
 * Every listing here belongs to a real ProviderOrganization from Handoff 03:
 * there is no separate "travel vendor" identity, no imported OTA inventory,
 * and no generated sample property. A city with no provider signed up returns
 * an empty search result, which is the honest answer.
 */
@Injectable()
export class TravelListingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly availability: TravelAvailabilityService,
  ) {}

  // --- Provider reads/writes -----------------------------------------------

  private async loadForOrganization(listingId: string, organizationId: string) {
    const row = await this.prisma.travelListing.findUnique({ where: { id: listingId }, include: LISTING_INCLUDE });
    if (!row) throw new TravelListingNotFoundException({ listingId });
    if (row.organizationId !== organizationId) throw new TravelListingAccessDeniedException({ listingId });
    return row;
  }

  async listForOrganization(organizationId: string, query: SearchTravelListingsQueryDto): Promise<PaginatedDto<TravelListingDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.TravelListingWhereInput = { organizationId, ...(query.type ? { type: query.type } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.travelListing.findMany({ where, include: LISTING_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.travelListing.count({ where }),
    ]);
    return toPaginatedDto(rows.map((r) => toTravelListingDto(r)), total, page, pageSize);
  }

  async getForOrganization(listingId: string, organizationId: string): Promise<TravelListingDto> {
    return toTravelListingDto(await this.loadForOrganization(listingId, organizationId));
  }

  async create(organizationId: string, input: CreateTravelListingDto): Promise<TravelListingDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.travelListing.create({
        data: {
          organizationId,
          type: input.type,
          title: input.title,
          description: input.description,
          country: input.country,
          city: input.city,
          address: input.address ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          imageObjectKeys: input.imageObjectKeys ?? [],
          amenities: input.amenities ?? [],
          pricingMode: input.pricingMode ?? TravelPricingMode.PER_NIGHT,
          bookingMode: input.bookingMode ?? undefined,
          cancellationPolicy: input.cancellationPolicy ?? null,
          province: input.province ?? null,
          checkInFrom: input.checkInFrom ?? null,
          checkOutUntil: input.checkOutUntil ?? null,
          houseRules: input.houseRules ?? null,
        },
        include: LISTING_INCLUDE,
      });
      await this.events.publish("TravelListingCreated", { listingId: row.id, organizationId, type: row.type }, { tx });
      return row;
    });
    return toTravelListingDto(created);
  }

  async update(listingId: string, organizationId: string, input: UpdateTravelListingDto): Promise<TravelListingDto> {
    const existing = await this.loadForOrganization(listingId, organizationId);
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new InvalidTravelListingTransitionException({ listingId, status: existing.status, reason: "NOT_EDITABLE" });
    }
    const row = await this.prisma.travelListing.update({
      where: { id: listingId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
        ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
        ...(input.imageObjectKeys !== undefined ? { imageObjectKeys: input.imageObjectKeys } : {}),
        ...(input.amenities !== undefined ? { amenities: input.amenities } : {}),
        ...(input.bookingMode !== undefined ? { bookingMode: input.bookingMode } : {}),
        ...(input.cancellationPolicy !== undefined ? { cancellationPolicy: input.cancellationPolicy } : {}),
        ...(input.province !== undefined ? { province: input.province } : {}),
        ...(input.checkInFrom !== undefined ? { checkInFrom: input.checkInFrom } : {}),
        ...(input.checkOutUntil !== undefined ? { checkOutUntil: input.checkOutUntil } : {}),
        ...(input.houseRules !== undefined ? { houseRules: input.houseRules } : {}),
      },
      include: LISTING_INCLUDE,
    });
    return toTravelListingDto(row);
  }

  async transition(listingId: string, organizationId: string, target: TravelListingStatus): Promise<TravelListingDto> {
    const existing = await this.loadForOrganization(listingId, organizationId);
    if (!PROVIDER_TRANSITIONS[existing.status].includes(target)) {
      throw new InvalidTravelListingTransitionException({ listingId, from: existing.status, to: target });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.travelListing.update({
        where: { id: listingId },
        // Leaving PUBLISHED always takes the listing off the public board —
        // an archived listing must never stay discoverable.
        data: {
          status: target,
          ...(target === TravelListingStatus.ARCHIVED ? { isPubliclyListed: false } : {}),
          ...(target === TravelListingStatus.PENDING_REVIEW ? { submittedAt: new Date() } : {}),
        },
        include: LISTING_INCLUDE,
      });
      await this.events.publish("TravelListingStatusChanged", { listingId, from: existing.status, to: target }, { tx });
      return updated;
    });
    return toTravelListingDto(row);
  }

  async upsertPetPolicy(listingId: string, organizationId: string, input: UpsertTravelPetPolicyDto): Promise<TravelListingDto> {
    await this.loadForOrganization(listingId, organizationId);
    // Every value is the provider's own assertion; an omitted boolean stays
    // false ("not stated"), which the UI renders as unknown, never as allowed.
    const data = {
      dogsAllowed: input.dogsAllowed ?? false,
      catsAllowed: input.catsAllowed ?? false,
      otherAllowed: input.otherAllowed ?? false,
      maxPets: input.maxPets ?? null,
      maxWeightKg: input.maxWeightKg ?? null,
      minWeightKg: input.minWeightKg ?? null,
      breedRestrictions: input.breedRestrictions ?? [],
      vaccinationRequired: input.vaccinationRequired ?? false,
      healthCertificateRequired: input.healthCertificateRequired ?? false,
      carrierRequired: input.carrierRequired ?? false,
      leashRequired: input.leashRequired ?? false,
      petFeeIrr: input.petFeeIrr ?? null,
      depositIrr: input.depositIrr ?? null,
      restrictedAreas: input.restrictedAreas ?? null,
      notes: input.notes ?? null,
    };
    await this.prisma.travelPetPolicy.upsert({ where: { listingId }, create: { listingId, ...data }, update: data });
    return toTravelListingDto(await this.loadForOrganization(listingId, organizationId));
  }

  // --- Inventory ------------------------------------------------------------

  async createUnit(listingId: string, organizationId: string, input: CreateTravelInventoryUnitDto): Promise<TravelListingDto> {
    await this.loadForOrganization(listingId, organizationId);
    await this.prisma.travelInventoryUnit.create({
      data: {
        listingId,
        name: input.name,
        description: input.description ?? null,
        quantity: input.quantity ?? 1,
        maxOccupancy: input.maxOccupancy ?? null,
        basePriceIrr: input.basePriceIrr,
        bedInfo: input.bedInfo ?? null,
        sizeSqm: input.sizeSqm ?? null,
        amenities: input.amenities ?? [],
        maxPets: input.maxPets ?? null,
        petNotes: input.petNotes ?? null,
      },
    });
    return toTravelListingDto(await this.loadForOrganization(listingId, organizationId));
  }

  async updateUnit(listingId: string, unitId: string, organizationId: string, input: UpdateTravelInventoryUnitDto): Promise<TravelListingDto> {
    await this.loadForOrganization(listingId, organizationId);
    const unit = await this.prisma.travelInventoryUnit.findFirst({ where: { id: unitId, listingId }, select: { id: true } });
    if (!unit) throw new TravelInventoryUnitNotFoundException({ unitId, listingId });

    await this.prisma.travelInventoryUnit.update({
      where: { id: unitId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.maxOccupancy !== undefined ? { maxOccupancy: input.maxOccupancy } : {}),
        ...(input.basePriceIrr !== undefined ? { basePriceIrr: input.basePriceIrr } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.bedInfo !== undefined ? { bedInfo: input.bedInfo } : {}),
        ...(input.sizeSqm !== undefined ? { sizeSqm: input.sizeSqm } : {}),
        ...(input.amenities !== undefined ? { amenities: input.amenities } : {}),
        ...(input.maxPets !== undefined ? { maxPets: input.maxPets } : {}),
        ...(input.petNotes !== undefined ? { petNotes: input.petNotes } : {}),
      },
    });
    return toTravelListingDto(await this.loadForOrganization(listingId, organizationId));
  }

  /**
   * Writes the provider's per-date overrides across a range. Absence of a row
   * still means "bookable at base price", so unblocking a date deletes the
   * override rather than storing an `isBlocked: false` marker.
   */
  async setAvailability(listingId: string, unitId: string, organizationId: string, input: SetTravelAvailabilityDto): Promise<number> {
    await this.loadForOrganization(listingId, organizationId);
    const unit = await this.prisma.travelInventoryUnit.findFirst({ where: { id: unitId, listingId }, select: { id: true } });
    if (!unit) throw new TravelInventoryUnitNotFoundException({ unitId, listingId });

    const from = toUtcMidnight(input.fromDate);
    const to = addDays(toUtcMidnight(input.toDate), 1);
    const dates = enumerateNights(from, to);

    await this.prisma.$transaction(async (tx) => {
      for (const date of dates) {
        const isBlocked = input.isBlocked ?? false;
        const priceIrr = input.priceIrr ?? null;
        if (!isBlocked && priceIrr === null) {
          await tx.travelAvailability.deleteMany({ where: { unitId, date } });
          continue;
        }
        await tx.travelAvailability.upsert({
          where: { unitId_date: { unitId, date } },
          create: { unitId, date, isBlocked, priceIrr },
          update: { isBlocked, priceIrr },
        });
      }
    });

    return dates.length;
  }

  // --- Batch 5: rate plans ----------------------------------------------------

  private async loadUnit(listingId: string, unitId: string, organizationId: string) {
    await this.loadForOrganization(listingId, organizationId);
    const unit = await this.prisma.travelInventoryUnit.findFirst({ where: { id: unitId, listingId } });
    if (!unit) throw new TravelInventoryUnitNotFoundException({ unitId, listingId });
    return unit;
  }

  private ratePlanData(input: RatePlanInputDto) {
    if (input.paymentTiming === "DEPOSIT" && !input.depositPercent) throw new ValidationApiException({ field: "depositPercent", reason: "REQUIRED_FOR_DEPOSIT" });
    if (input.cancellationType === "PARTIAL" && input.lateRefundPercent === undefined) throw new ValidationApiException({ field: "lateRefundPercent", reason: "REQUIRED_FOR_PARTIAL" });
    if (input.activeFrom && input.activeUntil && new Date(input.activeUntil) <= new Date(input.activeFrom)) throw new ValidationApiException({ field: "activeUntil", reason: "MUST_BE_AFTER_ACTIVE_FROM" });
    return {
      name: input.name.trim(),
      priceModifierPercent: input.priceModifierPercent ?? 0,
      cancellationType: input.cancellationType ?? "FREE_UNTIL",
      freeCancellationDays: input.cancellationType === "NON_REFUNDABLE" ? null : (input.freeCancellationDays ?? null),
      lateRefundPercent: input.cancellationType === "NON_REFUNDABLE" ? 0 : (input.lateRefundPercent ?? null),
      paymentTiming: input.paymentTiming ?? "PAY_NOW",
      depositPercent: input.paymentTiming === "DEPOSIT" ? (input.depositPercent ?? null) : null,
      includesBreakfast: input.includesBreakfast ?? false,
      includedItems: input.includedItems ?? [],
      minNights: input.minNights ?? null,
      activeFrom: input.activeFrom ? new Date(input.activeFrom) : null,
      activeUntil: input.activeUntil ? new Date(input.activeUntil) : null,
      isActive: input.isActive ?? true,
    } as const;
  }

  async createRatePlan(listingId: string, unitId: string, organizationId: string, input: RatePlanInputDto): Promise<TravelListingDto> {
    await this.loadUnit(listingId, unitId, organizationId);
    await this.prisma.travelRatePlan.create({ data: { unitId, ...this.ratePlanData(input) } });
    return toTravelListingDto(await this.loadForOrganization(listingId, organizationId));
  }

  /** Editing a rate plan never touches existing bookings — each booking holds its own snapshot. */
  async updateRatePlan(listingId: string, unitId: string, ratePlanId: string, organizationId: string, input: RatePlanInputDto): Promise<TravelListingDto> {
    await this.loadUnit(listingId, unitId, organizationId);
    const plan = await this.prisma.travelRatePlan.findFirst({ where: { id: ratePlanId, unitId } });
    if (!plan) throw new NotFoundApiException("Rate plan", { ratePlanId });
    await this.prisma.travelRatePlan.update({ where: { id: ratePlanId }, data: this.ratePlanData(input) });
    return toTravelListingDto(await this.loadForOrganization(listingId, organizationId));
  }

  // --- Batch 5: media -----------------------------------------------------------

  async addMedia(listingId: string, organizationId: string, input: TravelMediaInputDto): Promise<TravelListingDto> {
    await this.loadForOrganization(listingId, organizationId);
    if (input.unitId) await this.loadUnit(listingId, input.unitId, organizationId);
    const count = await this.prisma.travelMedia.count({ where: { listingId } });
    if (count >= 30) throw new ValidationApiException({ field: "url", reason: "MEDIA_LIMIT", max: 30 });
    await this.prisma.travelMedia.create({ data: { listingId, unitId: input.unitId ?? null, url: input.url, alt: input.alt ?? null, sortOrder: input.sortOrder ?? count } });
    return toTravelListingDto(await this.loadForOrganization(listingId, organizationId));
  }

  async removeMedia(listingId: string, mediaId: string, organizationId: string): Promise<TravelListingDto> {
    await this.loadForOrganization(listingId, organizationId);
    const res = await this.prisma.travelMedia.deleteMany({ where: { id: mediaId, listingId } });
    if (res.count === 0) throw new NotFoundApiException("Media", { mediaId });
    return toTravelListingDto(await this.loadForOrganization(listingId, organizationId));
  }

  // --- Batch 5: operations calendar -------------------------------------------------

  /** Per unit, per day: remaining, booked, blocked, price and the bookings occupying it (max 62 days). */
  async calendar(listingId: string, organizationId: string, fromInput: string, toInput: string): Promise<TravelProviderCalendarDto[]> {
    const listing = await this.loadForOrganization(listingId, organizationId);
    const from = toUtcMidnight(fromInput);
    const to = addDays(toUtcMidnight(toInput), 1);
    const nights = enumerateNights(from, to);
    if (nights.length === 0) return [];
    if (nights.length > 62) throw new ValidationApiException({ field: "to", reason: "CALENDAR_RANGE_TOO_LONG", maxDays: 62 });
    const [states, overrides, booked] = await Promise.all([
      this.availability.getNightStates(listing.units, nights),
      this.prisma.travelAvailability.findMany({ where: { unitId: { in: listing.units.map((u) => u.id) }, date: { in: nights }, isBlocked: true }, select: { unitId: true, date: true } }),
      this.prisma.travelBookedNight.findMany({ where: { unitId: { in: listing.units.map((u) => u.id) }, night: { in: nights } }, select: { unitId: true, night: true, booking: { select: { id: true, reference: true, status: true } } } }),
    ]);
    const blocked = new Set(overrides.map((o) => `${o.unitId}:${o.date.getTime()}`));
    return listing.units.map((unit) => {
      const state = states.get(unit.id)!;
      return {
        unitId: unit.id,
        unitName: unit.name,
        quantity: unit.quantity,
        days: nights.map((night) => {
          const here = booked.filter((b) => b.unitId === unit.id && b.night.getTime() === night.getTime());
          return {
            date: toDateKey(night),
            remaining: state.remaining.get(night.getTime()) ?? 0,
            booked: here.length,
            isBlocked: blocked.has(`${unit.id}:${night.getTime()}`),
            priceIrr: state.price.get(night.getTime()) ?? unit.basePriceIrr,
            bookings: here.map((b) => ({ id: b.booking.id, reference: b.booking.reference, status: b.booking.status as unknown as TravelProviderCalendarDto["days"][number]["bookings"][number]["status"] })),
          };
        }),
      };
    });
  }

  // --- Batch 5: finance statement (read-only) -----------------------------------------

  /**
   * A read-only statement built from bookings, payment intents and refunds.
   * There is no editable balance and no provider-side settlement engine yet:
   * payouts to travel partners are not automated, and the statement says so.
   */
  async finance(organizationId: string, fromInput?: string, toInput?: string): Promise<TravelProviderFinanceDto> {
    const to = toInput ? toUtcMidnight(toInput) : addDays(toUtcMidnight(new Date()), 1);
    const from = fromInput ? toUtcMidnight(fromInput) : addDays(to, -90);
    const rows = await this.prisma.travelBooking.findMany({
      where: { listing: { organizationId }, checkIn: { gte: from, lt: to }, status: { notIn: ["HELD", "MODIFIED", "EXPIRED", "REJECTED", "DRAFT"] } },
      select: { id: true, reference: true, checkIn: true, status: true, totalAmountIrr: true, payNowAmountIrr: true, paymentStatus: true, refundAmountIrr: true },
      orderBy: [{ checkIn: "asc" }, { id: "asc" }],
      take: 500,
    });
    const paid = (r: (typeof rows)[number]) => (["PAID", "REFUNDED", "PARTIALLY_REFUNDED", "REFUND_PENDING"].includes(r.paymentStatus) ? r.payNowAmountIrr : 0);
    const bookedValueIrr = rows.filter((r) => r.status !== "CANCELLED").reduce((s, r) => s + r.totalAmountIrr, 0);
    const paidOnlineIrr = rows.reduce((s, r) => s + paid(r), 0);
    const refundedIrr = rows.reduce((s, r) => s + r.refundAmountIrr, 0);
    return {
      from: toDateKey(from),
      to: toDateKey(to),
      bookingCount: rows.length,
      bookedValueIrr,
      paidOnlineIrr,
      refundedIrr,
      netCollectedIrr: paidOnlineIrr - refundedIrr,
      payAtPropertyIrr: rows.filter((r) => r.status !== "CANCELLED").reduce((s, r) => s + (r.totalAmountIrr - r.payNowAmountIrr), 0),
      rows: rows.map((r) => ({ bookingId: r.id, reference: r.reference, checkIn: toDateKey(r.checkIn), status: r.status as unknown as TravelProviderFinanceDto["rows"][number]["status"], totalIrr: r.totalAmountIrr, paidIrr: paid(r), refundedIrr: r.refundAmountIrr })),
      settlementNote: "PAYOUTS_NOT_AUTOMATED",
    };
  }

  // --- Batch 5: reviews -----------------------------------------------------------------

  async listReviews(organizationId: string, page = 1) {
    const size = 20;
    const where = { listing: { organizationId } };
    const [rows, total] = await Promise.all([
      this.prisma.travelReview.findMany({ where, include: { listing: { select: { title: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * size, take: size }),
      this.prisma.travelReview.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({ id: r.id, listingId: r.listingId, listingTitle: r.listing.title, overall: r.overall, petFriendliness: r.petFriendliness, cleanliness: r.cleanliness, location: r.location, body: r.body, status: r.status, providerResponse: r.providerResponse, createdAt: r.createdAt.toISOString() })),
      total,
      page,
      pageSize: size,
    };
  }

  /** One public response per review; the provider cannot edit or hide the review itself. */
  async respondToReview(organizationId: string, reviewId: string, response: string) {
    const review = await this.prisma.travelReview.findFirst({ where: { id: reviewId, listing: { organizationId } } });
    if (!review) throw new NotFoundApiException("Review", { reviewId });
    if (review.providerResponse) throw new ValidationApiException({ field: "response", reason: "ALREADY_RESPONDED" });
    await this.prisma.travelReview.update({ where: { id: reviewId }, data: { providerResponse: response.trim(), respondedAt: new Date() } });
    return { id: reviewId, providerResponse: response.trim() };
  }
}
