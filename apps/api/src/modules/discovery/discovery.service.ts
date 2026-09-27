import { Injectable } from "@nestjs/common";
import { BookingStatus, LocationMode, Prisma, type ProviderLocation, type ProviderService, type ProviderServiceVariant } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { SlotGeneratorService } from "../providers/slot-generator.service";
import { toProviderLocationDto, toProviderServiceDto } from "../providers/provider-dto.mapper";
import { ProviderReviewsService, type ProviderRatingSummary } from "../booking/provider-reviews.service";
import type { DiscoverProvidersDto, DiscoverySort } from "./discovery.dto";

const MAX_CANDIDATES = 60;
const AVAILABILITY_HORIZON_DAYS = 7;
/** Bayesian prior: a new provider starts at 4.0 as if it had 5 reviews, so one 5★ review cannot outrank fifty 4.8★ ones. */
const PRIOR_RATING = 4;
const PRIOR_WEIGHT = 5;

type ServiceWithVariants = ProviderService & { variants: ProviderServiceVariant[] };

export interface DiscoveryServiceSummary {
  id: string;
  name: string;
  category: string;
  type: string;
  startingPrice: number | null;
  currency: string | null;
  durationMinutes: number;
  homeVisit: boolean;
  bookingMode: string;
}

export interface ProviderDiscoveryResultDto {
  id: string;
  name: string;
  type: string;
  verified: boolean;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  specialties: string[];
  location: { id: string; city: string; region: string | null; addressLine: string } | null;
  distanceKm: number | null;
  services: DiscoveryServiceSummary[];
  startingPrice: number | null;
  currency: string | null;
  nextAvailableAt: string | null;
  rating: ProviderRatingSummary;
  completedBookings: number;
  petTypes: ("DOG" | "CAT")[];
  homeVisit: boolean;
  /** Real ranking inputs, exposed so the UI and QA can explain an order. */
  rankingScore: number;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

function startingPrice(service: ServiceWithVariants): number | null {
  const prices = [service.priceAmount, ...service.variants.filter((v) => v.isActive).map((v) => v.priceAmount)].filter((p): p is Prisma.Decimal => p !== null).map(Number);
  return prices.length ? Math.min(...prices) : null;
}

function isHomeVisit(service: ProviderService): boolean {
  return service.locationMode === LocationMode.AT_CUSTOMER || service.locationMode === LocationMode.MOBILE || service.type === "HOME_VISIT";
}

/**
 * Public discovery for every service category (Vet included). Only VERIFIED providers are ever
 * returned — an unverified provider cannot be booked, so it is never advertised.
 *
 * RECOMMENDED ranking (documented in docs/product/services-booking-research.md), all real signals,
 * no paid placement:
 *   3.0 × has an open slot in the next 7 days
 * + 2.0 × Bayesian-average rating / 5  (prior 4.0 weighted as 5 reviews)
 * + 1.0 × min(completed bookings, 50) / 50
 * + 1.0 × proximity (1 at 0 km → 0 at 20 km; only when the user shared a location)
 * Ties break by name, then id — fully deterministic.
 */
@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: SlotGeneratorService,
    private readonly reviews: ProviderReviewsService,
  ) {}

  async search(query: DiscoverProvidersDto): Promise<{ total: number; items: ProviderDiscoveryResultDto[] }> {
    const serviceWhere: Prisma.ProviderServiceWhereInput = {
      isActive: true,
      ...(query.category ? { category: query.category as never } : {}),
      ...(query.serviceType ? { type: query.serviceType as never } : {}),
      ...(query.species === "DOG" ? { supportsDog: true } : query.species === "CAT" ? { supportsCat: true } : {}),
      ...(query.homeVisit ? { OR: [{ locationMode: { in: [LocationMode.AT_CUSTOMER, LocationMode.MOBILE] } }, { type: "HOME_VISIT" as never }] } : {}),
    };
    const orgs = await this.prisma.providerOrganization.findMany({
      where: {
        verificationStatus: "VERIFIED",
        services: { some: serviceWhere },
        ...(query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { description: { contains: query.q, mode: "insensitive" } }, { specialties: { has: query.q } }] } : {}),
        ...(query.specialty ? { specialties: { has: query.specialty } } : {}),
        ...(query.city || query.neighborhood
          ? { locations: { some: { ...(query.city ? { city: { equals: query.city, mode: "insensitive" } } : {}), ...(query.neighborhood ? { region: { contains: query.neighborhood, mode: "insensitive" } } : {}) } } }
          : {}),
      },
      include: { locations: true, services: { where: serviceWhere, include: { variants: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: MAX_CANDIDATES,
    });

    const [ratings, completed] = await Promise.all([
      this.reviews.summaries(orgs.map((o) => o.id)),
      this.prisma.booking.groupBy({ by: ["providerOrganizationId"], where: { providerOrganizationId: { in: orgs.map((o) => o.id) }, bookingStatus: BookingStatus.COMPLETED }, _count: { _all: true } }),
    ]);

    const now = new Date();
    const dateWindow = query.date ? { from: new Date(`${query.date.slice(0, 10)}T00:00:00Z`), to: new Date(`${query.date.slice(0, 10)}T23:59:59Z`) } : null;

    const results: ProviderDiscoveryResultDto[] = [];
    for (const org of orgs) {
      const locations = org.locations.filter((l) => (!query.city || l.city.toLowerCase() === query.city.toLowerCase()) && (!query.neighborhood || (l.region ?? "").toLowerCase().includes(query.neighborhood.toLowerCase())));
      const location = this.pickLocation(locations.length ? locations : org.locations, query);
      const distanceKm = location && query.lat !== undefined && query.lng !== undefined && location.latitude !== null && location.longitude !== null ? haversineKm(query.lat, query.lng, location.latitude, location.longitude) : null;
      if (query.radiusKm && (distanceKm === null || distanceKm > query.radiusKm)) continue;

      const services = org.services;
      const prices = services.map(startingPrice).filter((p): p is number => p !== null);
      const minPrice = prices.length ? Math.min(...prices) : null;
      if (query.maxPrice !== undefined && (minPrice === null || minPrice > query.maxPrice)) continue;

      const rating = ratings.get(org.id) ?? { average: null, count: 0 };
      if (query.minRating !== undefined && (rating.average === null || rating.average < query.minRating)) continue;

      const window = dateWindow ?? { from: now, to: new Date(now.getTime() + AVAILABILITY_HORIZON_DAYS * 86400_000) };
      const nextAvailableAt = await this.firstOpenSlot(org.id, location, services, window.from < now ? now : window.from, window.to);
      if (dateWindow && !nextAvailableAt) continue;

      const completedBookings = completed.find((c) => c.providerOrganizationId === org.id)?._count._all ?? 0;
      const bayes = (PRIOR_RATING * PRIOR_WEIGHT + (rating.average ?? 0) * rating.count) / (PRIOR_WEIGHT + rating.count);
      const soonBonus = nextAvailableAt && new Date(nextAvailableAt).getTime() - now.getTime() <= AVAILABILITY_HORIZON_DAYS * 86400_000 ? 3 : 0;
      const proximity = distanceKm === null ? 0 : Math.max(0, 1 - distanceKm / 20);
      const rankingScore = Math.round((soonBonus + (2 * bayes) / 5 + Math.min(completedBookings, 50) / 50 + proximity) * 1000) / 1000;

      results.push({
        id: org.id,
        name: org.name,
        type: org.type,
        verified: true,
        description: org.description,
        logoUrl: org.logoUrl,
        coverImageUrl: org.coverImageUrl,
        specialties: org.specialties,
        location: location ? { id: location.id, city: location.city, region: location.region, addressLine: location.addressLine } : null,
        distanceKm,
        services: services.map((s) => ({ id: s.id, name: s.name, category: s.category, type: s.type, startingPrice: startingPrice(s), currency: s.currency, durationMinutes: s.durationMinutes, homeVisit: isHomeVisit(s), bookingMode: s.bookingMode })),
        startingPrice: minPrice,
        currency: services.find((s) => s.currency)?.currency ?? null,
        nextAvailableAt,
        rating,
        completedBookings,
        petTypes: [...(services.some((s) => s.supportsDog) ? (["DOG"] as const) : []), ...(services.some((s) => s.supportsCat) ? (["CAT"] as const) : [])],
        homeVisit: services.some(isHomeVisit),
        rankingScore,
      });
    }

    this.sort(results, query.sort ?? "RECOMMENDED");
    return { total: results.length, items: results };
  }

  private pickLocation(locations: ProviderLocation[], query: DiscoverProvidersDto): ProviderLocation | null {
    if (!locations.length) return null;
    if (query.lat === undefined || query.lng === undefined) return locations[0]!;
    return [...locations].sort((a, b) => {
      const da = a.latitude === null || a.longitude === null ? Infinity : haversineKm(query.lat!, query.lng!, a.latitude, a.longitude);
      const db = b.latitude === null || b.longitude === null ? Infinity : haversineKm(query.lat!, query.lng!, b.latitude, b.longitude);
      return da - db;
    })[0]!;
  }

  /** Earliest real open slot across the provider's matching services at the chosen location. */
  private async firstOpenSlot(orgId: string, location: ProviderLocation | null, services: ServiceWithVariants[], from: Date, to: Date): Promise<string | null> {
    if (!location) return null;
    let earliest: Date | null = null;
    for (const service of services.slice(0, 3)) {
      if (service.locationId && service.locationId !== location.id) continue;
      const variantId = service.variants.find((v) => v.isActive)?.id;
      const slots = await this.slots.generate({ providerOrganizationId: orgId, locationId: location.id, serviceId: service.id, variantId, from, to });
      const next = slots.find((s) => s.state === "AVAILABLE" && s.startAt >= from);
      if (next && (!earliest || next.startAt < earliest)) earliest = next.startAt;
    }
    return earliest?.toISOString() ?? null;
  }

  private sort(items: ProviderDiscoveryResultDto[], sort: DiscoverySort): void {
    const byName = (a: ProviderDiscoveryResultDto, b: ProviderDiscoveryResultDto) => a.name.localeCompare(b.name, "fa") || a.id.localeCompare(b.id);
    const nullsLast = (a: number | null, b: number | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b);
    const time = (v: string | null) => (v ? new Date(v).getTime() : null);
    items.sort((a, b) => {
      switch (sort) {
        case "EARLIEST":
          return nullsLast(time(a.nextAvailableAt), time(b.nextAvailableAt)) || byName(a, b);
        case "NEAREST":
          return nullsLast(a.distanceKm, b.distanceKm) || byName(a, b);
        case "TOP_RATED":
          return nullsLast(a.rating.average === null ? null : -a.rating.average, b.rating.average === null ? null : -b.rating.average) || b.rating.count - a.rating.count || byName(a, b);
        case "LOWEST_PRICE":
          return nullsLast(a.startingPrice, b.startingPrice) || byName(a, b);
        default:
          return b.rankingScore - a.rankingScore || byName(a, b);
      }
    });
  }

  /** Public entity detail for any verified provider: identity, media, team, services, policies, FAQ, reviews, trust signals. */
  async profile(providerId: string) {
    const org = await this.prisma.providerOrganization.findFirst({
      where: { id: providerId, verificationStatus: "VERIFIED" },
      include: {
        locations: true,
        services: { where: { isActive: true }, include: { variants: true, qualifiedStaff: { select: { providerUserId: true } } }, orderBy: { name: "asc" } },
        providerUsers: { where: { isBookable: true }, include: { user: { select: { displayName: true, avatarUrl: true } }, qualifiedServices: { select: { serviceId: true } } }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!org) throw new NotFoundApiException("Provider");
    const [rating, reviews, completedBookings] = await Promise.all([
      this.reviews.summary(org.id),
      this.reviews.listPublic(org.id, 10),
      this.prisma.booking.count({ where: { providerOrganizationId: org.id, bookingStatus: BookingStatus.COMPLETED } }),
    ]);
    const faqs = Array.isArray(org.faqs) ? (org.faqs as { question?: unknown; answer?: unknown }[]).filter((f) => typeof f.question === "string" && typeof f.answer === "string") : [];
    return {
      id: org.id,
      name: org.name,
      type: org.type,
      verified: true,
      description: org.description,
      logoUrl: org.logoUrl,
      coverImageUrl: org.coverImageUrl,
      galleryUrls: org.galleryUrls,
      specialties: org.specialties,
      policiesText: org.policiesText,
      faqs,
      phone: org.phone,
      websiteUrl: org.websiteUrl,
      locations: org.locations.map(toProviderLocationDto),
      services: org.services.map((s) => ({ ...toProviderServiceDto(s), startingPrice: startingPrice(s), homeVisit: isHomeVisit(s), staffIds: s.qualifiedStaff.map((q) => q.providerUserId) })),
      team: org.providerUsers.map((m) => ({ providerUserId: m.id, displayName: m.user.displayName, avatarUrl: m.user.avatarUrl, displayTitle: m.displayTitle, publicBio: m.publicBio, role: m.role === "VET" ? "VET" : "STAFF", serviceIds: m.qualifiedServices.map((q) => q.serviceId) })),
      rating,
      reviews,
      completedBookings,
      petTypes: [...(org.services.some((s) => s.supportsDog) ? ["DOG"] : []), ...(org.services.some((s) => s.supportsCat) ? ["CAT"] : [])],
      homeVisit: org.services.some(isHomeVisit),
    };
  }

  async cities(): Promise<string[]> {
    const rows = await this.prisma.providerLocation.findMany({ where: { providerOrganization: { verificationStatus: "VERIFIED" } }, distinct: ["city"], select: { city: true }, orderBy: { city: "asc" } });
    return rows.map((r) => r.city);
  }
}
