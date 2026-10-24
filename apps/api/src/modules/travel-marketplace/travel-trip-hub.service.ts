import { Injectable } from "@nestjs/common";
import { MedicalDocumentType, PetFriendlyPlaceStatus, TravelBookingStatus, TravelRequirementRuleStatus, TravelRequirementStatus, TripStatus } from "@prisma/client";
import type { TripHubDto, TripListItemDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { TripNotFoundException, ValidationApiException } from "../../common/errors/api-exception";
import { toTripDto } from "../travel/travel-mapper";
import { TravelRequirementService } from "../travel/travel-requirement.service";
import { toRuleDto } from "../admin/travel/admin-travel.service";
import { TravelBookingService } from "./travel-booking.service";
import { TravelSearchService } from "./travel-search.service";

const EXPIRING_WITHIN_DAYS = 30;

type Phase = TripHubDto["phase"];

export function tripPhase(trip: { status: TripStatus; departAt: Date; returnAt: Date | null }, hasConfirmedStay: boolean, now = new Date()): Phase {
  if (trip.status === TripStatus.CANCELLED) return "CANCELLED";
  const end = trip.returnAt ?? trip.departAt;
  if (trip.status === TripStatus.COMPLETED || end.getTime() < now.getTime() - 86_400_000) return "COMPLETED";
  if (trip.status === TripStatus.IN_PROGRESS || (trip.departAt <= now && end.getTime() >= now.getTime() - 86_400_000)) return "IN_PROGRESS";
  if (trip.status === TripStatus.READY || hasConfirmedStay) return "UPCOMING";
  return "PLANNING";
}

/**
 * Trip Hub (Batch 5): one read that aggregates what already lives in its own
 * domain — the Trip and its requirements (H19), travel bookings, pet
 * documents, insurance applications, places and vets. Nothing is copied onto
 * the Trip; every section is read live, so the hub can never disagree with
 * the booking, the document or the application it shows.
 */
@Injectable()
export class TravelTripHubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly requirements: TravelRequirementService,
    private readonly bookings: TravelBookingService,
    private readonly search: TravelSearchService,
  ) {}

  private async householdIds(userId: string): Promise<string[]> {
    return (await this.prisma.householdMember.findMany({ where: { userId }, select: { householdId: true } })).map((m) => m.householdId);
  }

  private async loadTrip(userId: string, tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { pet: true, _count: { select: { requirements: true } } } });
    if (!trip || !(await this.householdIds(userId)).includes(trip.householdId)) throw new TripNotFoundException({ tripId });
    return trip;
  }

  async listTrips(userId: string, scope?: "upcoming" | "past"): Promise<TripListItemDto[]> {
    const households = await this.householdIds(userId);
    const trips = await this.prisma.trip.findMany({
      where: { householdId: { in: households } },
      include: { pet: { select: { name: true } }, requirements: { select: { status: true } }, travelBookings: { select: { status: true } } },
      orderBy: [{ departAt: "asc" }, { id: "asc" }],
      take: 200,
    });
    const live: TravelBookingStatus[] = [TravelBookingStatus.CONFIRMED, TravelBookingStatus.IN_PROGRESS, TravelBookingStatus.COMPLETED];
    const items = trips.map((t) => {
      const phase = tripPhase(t, t.travelBookings.some((b) => live.includes(b.status)));
      return {
        id: t.id,
        petId: t.petId,
        petName: t.pet.name,
        destinationCity: t.destinationCity,
        destinationCountry: t.destinationCountry,
        departAt: t.departAt.toISOString(),
        returnAt: t.returnAt?.toISOString() ?? null,
        status: t.status as unknown as TripListItemDto["status"],
        phase,
        bookingCount: t.travelBookings.filter((b) => b.status !== TravelBookingStatus.MODIFIED && b.status !== TravelBookingStatus.HELD).length,
        readyCount: t.requirements.filter((r) => r.status === TravelRequirementStatus.READY || r.status === TravelRequirementStatus.NOT_REQUIRED).length,
        requirementCount: t.requirements.length,
      };
    });
    if (scope === "past") return items.filter((i) => i.phase === "COMPLETED" || i.phase === "CANCELLED").reverse();
    if (scope === "upcoming") return items.filter((i) => i.phase !== "COMPLETED" && i.phase !== "CANCELLED");
    return items;
  }

  async hub(userId: string, tripId: string): Promise<TripHubDto> {
    const trip = await this.loadTrip(userId, tripId);
    const now = new Date();
    const city = trip.destinationCity ?? "";
    const [summary, readiness, documents, insurance, cityPlaces, favorites, vets, bookingEvents, insuranceEvents, rules] = await Promise.all([
      this.bookings.getTripTravelSummary(tripId, trip.householdId),
      this.requirements.getReadinessSummary(trip.petId, tripId),
      this.prisma.medicalDocument.findMany({
        where: { petId: trip.petId, voidedAt: null, documentType: { in: [MedicalDocumentType.TRAVEL_DOCUMENT, MedicalDocumentType.VACCINATION_CERTIFICATE] } },
        select: { id: true, title: true, documentType: true, uploadedAt: true, travelRequirements: { where: { tripId }, select: { id: true } } },
        orderBy: { uploadedAt: "desc" },
        take: 30,
      }),
      this.prisma.insuranceApplication.findMany({ where: { petId: trip.petId }, include: { product: { include: { provider: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: 10 }),
      city
        ? this.prisma.petFriendlyPlace.findMany({ where: { city: { equals: city, mode: "insensitive" }, isPubliclyListed: true, status: { not: PetFriendlyPlaceStatus.SUSPENDED } }, select: { id: true, name: true, category: true, city: true }, orderBy: [{ name: "asc" }], take: 6 })
        : Promise.resolve([]),
      city
        ? this.prisma.petFriendlyPlaceFavorite.findMany({ where: { userId, place: { city: { equals: city, mode: "insensitive" } } }, select: { place: { select: { id: true, name: true, category: true, city: true } } }, take: 10 })
        : Promise.resolve([]),
      city ? this.search.nearbyVets(city, null, null) : Promise.resolve([]),
      this.prisma.travelBookingEvent.findMany({ where: { booking: { tripId } }, include: { booking: { select: { id: true, reference: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
      this.prisma.insuranceApplicationEvent.findMany({ where: { application: { petId: trip.petId }, createdAt: { gte: trip.createdAt } }, include: { application: { select: { id: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
      this.prisma.travelRequirementRule.findMany({ where: { country: trip.destinationCountry.toUpperCase(), status: TravelRequirementRuleStatus.ACTIVE, OR: [{ city: null }, ...(city ? [{ city: { equals: city, mode: "insensitive" as const } }] : [])] }, orderBy: [{ requirementType: "asc" }] }),
    ]);

    const documentStates: TripHubDto["documentStates"] = {};
    for (const r of readiness.requirements) {
      const validUntil = r.validUntil ? new Date(r.validUntil) : null;
      if (validUntil && validUntil < now) documentStates[r.id] = "EXPIRED";
      else if (r.linkedMedicalDocumentId && validUntil && validUntil.getTime() - now.getTime() < EXPIRING_WITHIN_DAYS * 86_400_000) documentStates[r.id] = "EXPIRING";
      else if (r.linkedMedicalDocumentId) documentStates[r.id] = "FOUND";
      else if (r.status === "UNKNOWN") documentStates[r.id] = "UNKNOWN";
      else if (r.status === "NOT_REQUIRED") documentStates[r.id] = "FOUND";
      else documentStates[r.id] = "MISSING";
    }

    const existingTypes = new Set(readiness.requirements.map((r) => r.requirementType as string));
    const suggestionRules = rules.filter((r) => !existingTypes.has(r.requirementType) && (r.species.length === 0 || r.species.includes(trip.pet.species)));

    const activity: TripHubDto["activity"] = [
      ...bookingEvents.map((e) => ({ type: "BOOKING", label: `${e.booking.reference}:${e.toStatus}${e.reason ? `:${e.reason}` : ""}`, at: e.createdAt.toISOString(), link: `/travel/bookings/${e.booking.id}` })),
      ...readiness.requirements.map((r) => ({ type: "REQUIREMENT", label: `${r.requirementType}:${r.status}`, at: r.updatedAt, link: null })),
      ...insuranceEvents.map((e) => ({ type: "INSURANCE", label: `${e.toStatus}`, at: e.createdAt.toISOString(), link: `/pets/${trip.petId}/insurance` })),
      ...documents.filter((d) => d.uploadedAt >= trip.createdAt).map((d) => ({ type: "DOCUMENT", label: d.title, at: d.uploadedAt.toISOString(), link: `/pets/${trip.petId}/health` })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 25);

    const confirmed = summary.bookings.some((b) => ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(b.status));
    return {
      trip: toTripDto(trip),
      petName: trip.pet.name,
      petSpecies: trip.pet.species,
      phase: tripPhase(trip, confirmed, now),
      bookings: summary.bookings.filter((b) => b.status !== "HELD"),
      readiness,
      documentStates,
      documents: documents.map((d) => ({ id: d.id, title: d.title, documentType: d.documentType, linkedRequirementIds: d.travelRequirements.map((r) => r.id) })),
      insuranceApplications: insurance.map((a) => ({ id: a.id, productName: a.product.name, providerName: a.product.provider.name, status: a.status as unknown as TripHubDto["insuranceApplications"][number]["status"], submittedAt: a.submittedAt?.toISOString() ?? null })),
      nearbyPlaces: cityPlaces.map((p) => ({ id: p.id, name: p.name, category: p.category, city: p.city })),
      favoritePlaces: favorites.map((f) => ({ id: f.place.id, name: f.place.name, category: f.place.category, city: f.place.city })),
      nearbyVets: vets.map((v) => ({ id: v.id, name: v.name, city: v.city })),
      activity,
      suggestions: { requirementRules: suggestionRules.map(toRuleDto) },
    };
  }

  /**
   * Adds checklist rows from the admin-curated library. Provenance is copied
   * verbatim (source, URL, jurisdiction, the library's verification date and
   * validity); the row starts REQUIRED — never READY — so the household still
   * has to produce the evidence.
   */
  async addFromRules(userId: string, tripId: string, ruleIds: string[]): Promise<TripHubDto> {
    const trip = await this.loadTrip(userId, tripId);
    const rules = await this.prisma.travelRequirementRule.findMany({ where: { id: { in: ruleIds }, status: TravelRequirementRuleStatus.ACTIVE, country: trip.destinationCountry.toUpperCase() } });
    if (rules.length !== new Set(ruleIds).size) throw new ValidationApiException({ field: "ruleIds", reason: "UNKNOWN_OR_INACTIVE_RULE" });
    const existing = new Set((await this.prisma.travelRequirement.findMany({ where: { tripId }, select: { requirementType: true } })).map((r) => r.requirementType));
    await this.prisma.$transaction(async (tx) => {
      for (const rule of rules) {
        if (existing.has(rule.requirementType)) continue;
        const row = await tx.travelRequirement.create({
          data: {
            tripId,
            requirementType: rule.requirementType,
            status: TravelRequirementStatus.REQUIRED,
            source: rule.source,
            sourceUrl: rule.sourceUrl,
            jurisdiction: rule.city ? `${rule.country}/${rule.city}` : rule.country,
            verifiedAt: rule.verifiedAt,
            validUntil: rule.validUntil,
            notes: rule.title,
          },
        });
        await this.events.publish("TravelRequirementUpdated", { petId: trip.petId, tripId, requirementId: row.id, status: row.status }, { tx, aggregateType: "Pet", aggregateId: trip.petId });
      }
    });
    return this.hub(userId, tripId);
  }
}
