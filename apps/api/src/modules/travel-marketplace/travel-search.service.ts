import { Injectable } from "@nestjs/common";
import { Prisma, PetFriendlyPlaceStatus, ProviderType, ProviderVerificationStatus, TravelListingStatus, TravelReviewStatus } from "@prisma/client";
import type {
  PetPolicyMatchOutcome,
  TravelDestinationDto,
  TravelListingDetailDto,
  TravelRatingSummaryDto,
  TravelSearchResultDto,
  TravelSearchResultItemDto,
} from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TravelListingNotFoundException, ValidationApiException } from "../../common/errors/api-exception";
import { EMPTY_TRAVEL_RATING, LISTING_INCLUDE, toTravelListingDto, type ListingWithRelations } from "./travel-marketplace-mapper";
import { TravelAvailabilityService, type UnitNightState } from "./travel-availability.service";
import { resolveStayRange, toUtcMidnight } from "./travel-date.util";
import { haversineKm, matchPetPolicy, priceStay, ratePlanApplies, type PetFacts, type RatePlanTerms } from "./travel-pricing.util";
import type { TravelSearchQueryDto } from "./dto/travel-marketplace.dto";
import { TravelBookingService } from "./travel-booking.service";

const MAX_CANDIDATES = 300;
const BAYES_PRIOR = 4;
const BAYES_WEIGHT = 5;
const VET_TYPES: ProviderType[] = [ProviderType.VET_CLINIC, ProviderType.VET_HOSPITAL, ProviderType.VETERINARIAN];

/** No map tile provider is contracted; the UI degrades to a distance-sorted list rather than a fake map. */
export const TRAVEL_MAP_AVAILABLE = false;

export interface StayOption {
  unitId: string;
  ratePlanId: string | null;
  nights: number;
  totalIrr: number;
  petFeeIrr: number;
  freeCancellation: boolean;
}

/**
 * Public travel discovery (Batch 5). Every figure is computed from real
 * provider data: availability from booked nights and provider blocks, price
 * from the unit/rate plan/pet fee, rating only from verified completed stays.
 * One candidate query + one ratings query + one availability pass — no N+1.
 */
@Injectable()
export class TravelSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: TravelAvailabilityService,
    private readonly bookings: TravelBookingService,
  ) {}

  async ratings(listingIds: string[]): Promise<Map<string, TravelRatingSummaryDto>> {
    if (listingIds.length === 0) return new Map();
    const rows = await this.prisma.travelReview.groupBy({
      by: ["listingId"],
      where: { listingId: { in: listingIds }, status: TravelReviewStatus.PUBLISHED },
      _avg: { overall: true, petFriendliness: true, cleanliness: true, location: true },
      _count: { _all: true },
    });
    const round = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
    return new Map(
      rows.map((r) => [r.listingId, { average: round(r._avg.overall), count: r._count._all, petFriendliness: round(r._avg.petFriendliness), cleanliness: round(r._avg.cleanliness), location: round(r._avg.location) }]),
    );
  }

  private bayes(r: TravelRatingSummaryDto): number {
    return (BAYES_PRIOR * BAYES_WEIGHT + (r.average ?? 0) * r.count) / (BAYES_WEIGHT + r.count);
  }

  /** Cheapest bookable unit + rate for the whole stay, honouring capacity and unit pet limits. */
  private bestStay(listing: ListingWithRelations, nights: Date[], states: Map<string, UnitNightState>, guests: number, petCount: number, checkIn: Date): StayOption | null {
    let best: StayOption | null = null;
    for (const unit of listing.units) {
      if (!unit.isActive) continue;
      if (unit.maxOccupancy !== null && guests > unit.maxOccupancy) continue;
      if (unit.maxPets !== null && petCount > unit.maxPets) continue;
      const state = states.get(unit.id);
      if (!state || nights.some((n) => (state.remaining.get(n.getTime()) ?? 0) <= 0)) continue;
      const activePlans = unit.ratePlans.filter((p) => p.isActive);
      const plans: (RatePlanTerms | null)[] = activePlans.length ? activePlans.filter((p) => ratePlanApplies(p, checkIn, nights.length)) : [null];
      for (const plan of plans) {
        const b = priceStay({ nights, nightlyPriceIrr: state.price, basePriceIrr: unit.basePriceIrr, plan, policy: listing.petPolicy, petCount });
        const option: StayOption = {
          unitId: unit.id,
          ratePlanId: plan?.id ?? null,
          nights: nights.length,
          totalIrr: b.totalIrr,
          petFeeIrr: b.petFeeIrr,
          // Only an explicit free-cancellation rate counts; free-text terms are never read as "free".
          freeCancellation: plan?.cancellationType === "FREE_UNTIL",
        };
        if (!best || option.totalIrr < best.totalIrr || (option.totalIrr === best.totalIrr && option.freeCancellation && !best.freeCancellation)) best = option;
      }
    }
    return best;
  }

  private fromNightly(listing: ListingWithRelations): number | null {
    const prices = listing.units
      .filter((u) => u.isActive)
      .flatMap((u) => {
        const plans = u.ratePlans.filter((p) => p.isActive);
        return plans.length ? plans.map((p) => Math.round((u.basePriceIrr * (100 + p.priceModifierPercent)) / 100)) : [u.basePriceIrr];
      });
    return prices.length ? Math.min(...prices) : null;
  }

  async search(userId: string | undefined, q: TravelSearchQueryDto): Promise<TravelSearchResultDto> {
    if ((q.checkIn && !q.checkOut) || (!q.checkIn && q.checkOut)) throw new ValidationApiException({ field: "checkOut", reason: "BOTH_DATES_REQUIRED" });
    if (q.checkIn && toUtcMidnight(q.checkIn) < toUtcMidnight(new Date())) throw new ValidationApiException({ field: "checkIn", reason: "CHECK_IN_IN_PAST" });
    if (q.sort === "DISTANCE" && (q.lat === undefined || q.lng === undefined)) throw new ValidationApiException({ field: "sort", reason: "DISTANCE_NEEDS_LOCATION" });

    // Pet facts: the caller's own pets (never exposed in results) or an anonymous shape.
    let pets: PetFacts[] = [];
    if (q.petIds?.length) pets = await this.bookings.petFactsFor(userId, q.petIds);
    else if (q.species) pets = Array.from({ length: q.petCount ?? 1 }, (_, i) => ({ id: `anon-${i}`, name: null, species: q.species!, weightKg: q.petWeightKg ?? null }));
    const guests = q.guests ?? 1;

    const species = new Set(pets.map((p) => p.species));
    const where: Prisma.TravelListingWhereInput = {
      status: TravelListingStatus.PUBLISHED,
      isPubliclyListed: true,
      // A suspended (or otherwise unverified) partner's listings leave search and can't be booked.
      organization: { verificationStatus: ProviderVerificationStatus.VERIFIED },
      ...(q.city ? { city: { equals: q.city.trim(), mode: "insensitive" } } : {}),
      ...(q.province ? { province: { equals: q.province.trim(), mode: "insensitive" } } : {}),
      ...(q.country ? { country: { equals: q.country, mode: "insensitive" } } : {}),
      ...(q.types?.length ? { type: { in: q.types } } : {}),
      ...(q.verified ? { isVerified: true } : {}),
      ...(q.instantBooking ? { bookingMode: "INSTANT_BOOKING" } : {}),
      ...(q.amenities?.length ? { amenities: { hasEvery: q.amenities } } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { description: { contains: q.q, mode: "insensitive" } }, { city: { contains: q.q, mode: "insensitive" } }] } : {}),
      ...(species.has("DOG") || species.has("CAT") || q.noPetFee
        ? {
            petPolicy: {
              ...(species.has("DOG") ? { dogsAllowed: true } : {}),
              ...(species.has("CAT") ? { catsAllowed: true } : {}),
              ...(q.noPetFee ? { OR: [{ petFeeIrr: null }, { petFeeIrr: 0 }] } : {}),
            },
          }
        : {}),
      units: { some: { isActive: true, ...(guests > 1 ? { OR: [{ maxOccupancy: null }, { maxOccupancy: { gte: guests } }] } : {}) } },
    };
    const candidates = await this.prisma.travelListing.findMany({ where, include: LISTING_INCLUDE, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: MAX_CANDIDATES });

    const ratings = await this.ratings(candidates.map((c) => c.id));
    let nights: Date[] = [];
    let checkIn: Date | null = null;
    let states = new Map<string, UnitNightState>();
    if (q.checkIn && q.checkOut) {
      const range = resolveStayRange(q.checkIn, q.checkOut, false);
      nights = range.nights;
      checkIn = range.checkIn;
      states = await this.availability.getNightStates(candidates.flatMap((c) => c.units), nights);
    }
    const favorites = userId ? new Set((await this.prisma.travelListingFavorite.findMany({ where: { userId, listingId: { in: candidates.map((c) => c.id) } }, select: { listingId: true } })).map((f) => f.listingId)) : new Set<string>();

    const items: (TravelSearchResultItemDto & { _score: number; _price: number | null; _bayes: number; _match: number })[] = [];
    for (const listing of candidates) {
      const rating = ratings.get(listing.id) ?? EMPTY_TRAVEL_RATING;
      if (q.minRating && (rating.average === null || rating.average < q.minRating)) continue;
      const stay = checkIn ? this.bestStay(listing, nights, states, guests, pets.length, checkIn) : null;
      if (checkIn && !stay) continue;
      const fromNightlyIrr = this.fromNightly(listing);
      const freeCancellationAvailable = stay ? stay.freeCancellation : hasFreeCancellationRate(listing);
      if (q.freeCancellation && !freeCancellationAvailable) continue;
      const price = stay ? stay.totalIrr : fromNightlyIrr;
      if (q.minPrice !== undefined && (price === null || price < q.minPrice)) continue;
      if (q.maxPrice !== undefined && (price === null || price > q.maxPrice)) continue;
      const distanceKm = q.lat !== undefined && q.lng !== undefined && listing.latitude !== null && listing.longitude !== null ? Math.round(haversineKm(q.lat, q.lng, listing.latitude, listing.longitude) * 10) / 10 : null;
      if (q.radiusKm && q.lat !== undefined && (distanceKm === null || distanceKm > q.radiusKm)) continue;
      const petMatch: PetPolicyMatchOutcome | null = pets.length ? matchPetPolicy(listing.petPolicy, pets).outcome : null;
      // A listing whose stated policy clearly excludes these pets is never shown as bookable for them.
      if (petMatch === "POTENTIAL_CONFLICT") continue;
      const bayes = this.bayes(rating);
      const matchScore = petMatch === "MATCH" ? 1 : petMatch === "MORE_INFO_NEEDED" ? 0.3 : 0;
      const proximity = distanceKm === null ? 0 : Math.max(0, 1 - distanceKm / 50);
      items.push({
        ...toSearchItem(listing, rating, stay, fromNightlyIrr, favorites.has(listing.id)),
        freeCancellationAvailable,
        distanceKm,
        petMatch,
        _score: 2 * (bayes / 5) + (listing.isVerified ? 0.5 : 0) + matchScore + proximity,
        _price: price,
        _bayes: bayes,
        _match: matchScore,
      });
    }

    const byTitle = (a: { title: string; id: string }, b: { title: string; id: string }) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    const sort = q.sort ?? "RECOMMENDED";
    items.sort((a, b) => {
      if (sort === "PRICE_ASC") return (a._price ?? Infinity) - (b._price ?? Infinity) || byTitle(a, b);
      if (sort === "PRICE_DESC") return (b._price ?? -Infinity) - (a._price ?? -Infinity) || byTitle(a, b);
      if (sort === "RATING") return b._bayes - a._bayes || b.rating.count - a.rating.count || byTitle(a, b);
      if (sort === "DISTANCE") return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || byTitle(a, b);
      if (sort === "BEST_PET_MATCH") return b._match - a._match || (b.petPolicySummary.stated ? 1 : 0) - (a.petPolicySummary.stated ? 1 : 0) || b._bayes - a._bayes || byTitle(a, b);
      return b._score - a._score || byTitle(a, b);
    });

    const typeCounts = new Map<string, number>();
    const amenityCounts = new Map<string, number>();
    const prices: number[] = [];
    for (const i of items) {
      typeCounts.set(i.type, (typeCounts.get(i.type) ?? 0) + 1);
      for (const a of i.amenities) amenityCounts.set(a, (amenityCounts.get(a) ?? 0) + 1);
      if (i._price !== null) prices.push(i._price);
    }
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 12;
    const slice = items.slice((page - 1) * pageSize, page * pageSize).map(({ _score, _price, _bayes, _match, ...rest }) => {
      void _score;
      void _price;
      void _bayes;
      void _match;
      return rest;
    });
    return {
      items: slice,
      total: items.length,
      page,
      pageSize,
      facets: {
        types: [...typeCounts].map(([type, count]) => ({ type: type as TravelSearchResultItemDto["type"], count })).sort((a, b) => b.count - a.count),
        amenities: [...amenityCounts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, 20),
        priceRange: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
      },
      mapAvailable: TRAVEL_MAP_AVAILABLE,
    };
  }

  async destinations(): Promise<TravelDestinationDto[]> {
    const rows = await this.prisma.travelListing.groupBy({
      by: ["country", "province", "city"],
      where: { status: TravelListingStatus.PUBLISHED, isPubliclyListed: true, organization: { verificationStatus: ProviderVerificationStatus.VERIFIED } },
      _count: { _all: true },
      orderBy: [{ country: "asc" }, { city: "asc" }],
    });
    return rows.map((r) => ({ country: r.country, province: r.province, city: r.city, listingCount: r._count._all }));
  }

  async detail(userId: string | undefined, listingId: string): Promise<TravelListingDetailDto> {
    const row = await this.prisma.travelListing.findFirst({ where: { id: listingId, status: TravelListingStatus.PUBLISHED, isPubliclyListed: true, organization: { verificationStatus: ProviderVerificationStatus.VERIFIED } }, include: LISTING_INCLUDE });
    if (!row) throw new TravelListingNotFoundException({ listingId });
    const [ratings, reviews, favorite, nearbyPlaces, nearbyVets] = await Promise.all([
      this.ratings([row.id]),
      this.bookings.listPublishedReviews(row.id, 1, 6),
      userId ? this.prisma.travelListingFavorite.findUnique({ where: { userId_listingId: { userId, listingId } } }) : Promise.resolve(null),
      this.nearbyPlaces(row.latitude, row.longitude),
      this.nearbyVets(row.city, row.latitude, row.longitude),
    ]);
    return {
      ...toTravelListingDto(row, ratings.get(row.id) ?? EMPTY_TRAVEL_RATING),
      // Only active units and rate plans are offered to the public.
      units: toTravelListingDto(row).units.filter((u) => u.isActive).map((u) => ({ ...u, ratePlans: u.ratePlans.filter((p) => p.isActive) })),
      reviews: reviews.items,
      favorited: Boolean(favorite),
      nearbyPlaces,
      nearbyVets,
      mapAvailable: TRAVEL_MAP_AVAILABLE,
    };
  }

  /** Published pet-friendly places within 10 km — PostGIS geography distance. */
  async nearbyPlaces(lat: number | null, lng: number | null, limit = 6): Promise<{ id: string; name: string; category: string; distanceKm: number }[]> {
    if (lat === null || lng === null) return [];
    const rows = await this.prisma.$queryRaw<{ id: string; name: string; category: string; distance_m: number }[]>`
      SELECT id, name, category::text AS category,
             ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS distance_m
      FROM pet_friendly_places
      WHERE "isPubliclyListed" = true AND status <> ${PetFriendlyPlaceStatus.SUSPENDED}::"PetFriendlyPlaceStatus" AND location IS NOT NULL
        AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 10000)
      ORDER BY distance_m ASC, id ASC
      LIMIT ${limit}`;
    return rows.map((r) => ({ id: r.id, name: r.name, category: r.category, distanceKm: Math.round((Number(r.distance_m) / 1000) * 10) / 10 }));
  }

  /** Verified vet organisations in the same city, nearest first when coordinates exist. */
  async nearbyVets(city: string, lat: number | null, lng: number | null, limit = 4): Promise<{ id: string; name: string; city: string; distanceKm: number | null }[]> {
    const orgs = await this.prisma.providerOrganization.findMany({
      where: { type: { in: VET_TYPES }, verificationStatus: ProviderVerificationStatus.VERIFIED, locations: { some: { city: { equals: city, mode: "insensitive" } } } },
      select: { id: true, name: true, locations: { where: { city: { equals: city, mode: "insensitive" } }, select: { city: true, latitude: true, longitude: true } } },
      take: 20,
    });
    return orgs
      .map((o) => {
        const loc = o.locations[0]!;
        const distanceKm = lat !== null && lng !== null && loc.latitude !== null && loc.longitude !== null ? Math.round(haversineKm(lat, lng, loc.latitude, loc.longitude) * 10) / 10 : null;
        return { id: o.id, name: o.name, city: loc.city, distanceKm };
      })
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  /** Same item shape and facts as search, for 2–3 chosen listings (optionally priced for dates). */
  async compare(userId: string | undefined, ids: string[], checkInInput?: string, checkOutInput?: string): Promise<TravelSearchResultItemDto[]> {
    const rows = await this.prisma.travelListing.findMany({ where: { id: { in: ids }, status: TravelListingStatus.PUBLISHED, isPubliclyListed: true, organization: { verificationStatus: ProviderVerificationStatus.VERIFIED } }, include: LISTING_INCLUDE });
    const ratings = await this.ratings(rows.map((r) => r.id));
    let nights: Date[] = [];
    let checkIn: Date | null = null;
    let states = new Map<string, UnitNightState>();
    if (checkInInput && checkOutInput) {
      const range = resolveStayRange(checkInInput, checkOutInput, false);
      nights = range.nights;
      checkIn = range.checkIn;
      states = await this.availability.getNightStates(rows.flatMap((r) => r.units), nights);
    }
    const favorites = userId ? new Set((await this.prisma.travelListingFavorite.findMany({ where: { userId, listingId: { in: rows.map((r) => r.id) } }, select: { listingId: true } })).map((f) => f.listingId)) : new Set<string>();
    return ids
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is ListingWithRelations => Boolean(r))
      .map((r) => {
        const stay = checkIn ? this.bestStay(r, nights, states, 1, 0, checkIn) : null;
        return { ...toSearchItem(r, ratings.get(r.id) ?? EMPTY_TRAVEL_RATING, stay, this.fromNightly(r), favorites.has(r.id)), freeCancellationAvailable: stay ? stay.freeCancellation : hasFreeCancellationRate(r), distanceKm: null, petMatch: null };
      });
  }

}

function hasFreeCancellationRate(listing: ListingWithRelations): boolean {
  return listing.units.some((u) => u.isActive && u.ratePlans.some((p) => p.isActive && p.cancellationType === "FREE_UNTIL"));
}

function toSearchItem(listing: ListingWithRelations, rating: TravelRatingSummaryDto, stay: TravelSearchResultItemDto["stay"], fromNightlyIrr: number | null, favorited: boolean): Omit<TravelSearchResultItemDto, "freeCancellationAvailable" | "distanceKm" | "petMatch"> {
  return {
    id: listing.id,
    title: listing.title,
    type: listing.type as unknown as TravelSearchResultItemDto["type"],
    city: listing.city,
    province: listing.province,
    country: listing.country,
    coverUrl: listing.media.find((m) => !m.unitId)?.url ?? listing.media[0]?.url ?? null,
    latitude: listing.latitude,
    longitude: listing.longitude,
    isVerified: listing.isVerified,
    bookingMode: listing.bookingMode as unknown as TravelSearchResultItemDto["bookingMode"],
    rating,
    petPolicySummary: {
      dogsAllowed: listing.petPolicy?.dogsAllowed ?? false,
      catsAllowed: listing.petPolicy?.catsAllowed ?? false,
      maxPets: listing.petPolicy?.maxPets ?? null,
      maxWeightKg: listing.petPolicy?.maxWeightKg ?? null,
      petFeeIrr: listing.petPolicy?.petFeeIrr ?? null,
      stated: Boolean(listing.petPolicy),
    },
    stay,
    fromNightlyIrr,
    amenities: listing.amenities,
    favorited,
  };
}
