import { Injectable } from "@nestjs/common";
import { Prisma, TravelListingStatus, TravelPricingMode } from "@prisma/client";
import type { PaginatedDto, TravelListingDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import {
  InvalidTravelListingTransitionException,
  TravelInventoryUnitNotFoundException,
  TravelListingAccessDeniedException,
  TravelListingNotFoundException,
} from "../../common/errors/api-exception";
import { LISTING_INCLUDE, toTravelListingDto } from "./travel-marketplace-mapper";
import { TravelAvailabilityService } from "./travel-availability.service";
import { enumerateNights, resolveStayRange, toUtcMidnight, addDays } from "./travel-date.util";
import type {
  CreateTravelInventoryUnitDto,
  CreateTravelListingDto,
  SearchTravelListingsQueryDto,
  SetTravelAvailabilityDto,
  UpdateTravelInventoryUnitDto,
  UpdateTravelListingDto,
  UpsertTravelPetPolicyDto,
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

  // --- Public reads ---------------------------------------------------------

  /**
   * Public search. Only PUBLISHED + publicly listed rows are ever returned,
   * and when the caller supplies dates the result is narrowed to listings
   * with a unit genuinely free for the whole range — never "probably free".
   */
  async search(query: SearchTravelListingsQueryDto): Promise<PaginatedDto<TravelListingDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);

    const where: Prisma.TravelListingWhereInput = {
      status: TravelListingStatus.PUBLISHED,
      isPubliclyListed: true,
      ...(query.city ? { city: { equals: query.city, mode: "insensitive" } } : {}),
      ...(query.country ? { country: { equals: query.country, mode: "insensitive" } } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.dogsAllowed ? { petPolicy: { dogsAllowed: true } } : {}),
      ...(query.catsAllowed ? { petPolicy: { catsAllowed: true } } : {}),
      units: {
        some: {
          isActive: true,
          ...(query.guests ? { OR: [{ maxOccupancy: null }, { maxOccupancy: { gte: query.guests } }] } : {}),
          ...(query.maxPriceIrr !== undefined ? { basePriceIrr: { lte: query.maxPriceIrr } } : {}),
        },
      },
    };

    const [rows, total] = await Promise.all([
      this.prisma.travelListing.findMany({ where, include: LISTING_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.travelListing.count({ where }),
    ]);

    const dtos = rows.map(toTravelListingDto);
    if (!query.checkIn || !query.checkOut) return toPaginatedDto(dtos, total, page, pageSize);

    // Date-filtered search costs one availability pass per candidate listing.
    // That is deliberate: showing a listing the traveller cannot actually book
    // is exactly the "fake availability" the spec forbids.
    const bookable = await this.filterByRealAvailability(rows, query.checkIn, query.checkOut);
    const bookableIds = new Set(bookable);
    const filtered = dtos.filter((dto) => bookableIds.has(dto.id));
    return toPaginatedDto(filtered, filtered.length, page, pageSize);
  }

  private async filterByRealAvailability(
    rows: Array<{ id: string; pricingMode: TravelPricingMode; units: Array<{ id: string; isActive: boolean }> }>,
    checkIn: string,
    checkOut: string,
  ): Promise<string[]> {
    const available: string[] = [];
    for (const listing of rows) {
      const perTrip = listing.pricingMode === TravelPricingMode.PER_TRIP;
      const { nights } = resolveStayRange(checkIn, checkOut, perTrip);
      for (const unit of listing.units) {
        if (!unit.isActive) continue;
        const remaining = await this.availability.getRemainingByNight(unit.id, nights);
        if (nights.every((night) => (remaining.get(night.getTime()) ?? 0) > 0)) {
          available.push(listing.id);
          break;
        }
      }
    }
    return available;
  }

  async getPublic(listingId: string): Promise<TravelListingDto> {
    const row = await this.prisma.travelListing.findFirst({
      where: { id: listingId, status: TravelListingStatus.PUBLISHED, isPubliclyListed: true },
      include: LISTING_INCLUDE,
    });
    if (!row) throw new TravelListingNotFoundException({ listingId });
    return toTravelListingDto(row);
  }

  /** The cities that actually have published supply — drives the search form's suggestions. */
  async listCities(): Promise<Array<{ country: string; city: string }>> {
    const rows = await this.prisma.travelListing.findMany({
      where: { status: TravelListingStatus.PUBLISHED, isPubliclyListed: true },
      select: { country: true, city: true },
      distinct: ["country", "city"],
      orderBy: [{ country: "asc" }, { city: "asc" }],
    });
    return rows;
  }

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
    return toPaginatedDto(rows.map(toTravelListingDto), total, page, pageSize);
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
        data: { status: target, ...(target === TravelListingStatus.ARCHIVED ? { isPubliclyListed: false } : {}) },
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
}
