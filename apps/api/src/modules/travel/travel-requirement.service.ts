import { Injectable } from "@nestjs/common";
import { Prisma, TravelRequirementStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { TravelRequirementDocumentMismatchException, TravelRequirementNotFoundException, TripNotFoundException } from "../../common/errors/api-exception";
import { toTravelRequirementDto } from "./travel-mapper";
import { getSuggestedRequirementTypes } from "./travel-requirement-templates";
import type { CreateTravelRequirementDto, UpdateTravelRequirementDto } from "./dto/travel.dto";
import type { TripReadinessSummaryDto } from "@petlife/types";

const REQUIREMENT_INCLUDE = { linkedMedicalDocument: true } satisfies Prisma.TravelRequirementInclude;

/** A requirement counts toward readiness only when it needs no further action — spec's locked rule: unknown/required/incomplete never become "ready" by omission. */
const READY_FOR_TRAVEL_STATUSES: TravelRequirementStatus[] = [TravelRequirementStatus.READY, TravelRequirementStatus.NOT_REQUIRED];

@Injectable()
export class TravelRequirementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  private async getTripOrThrow(petId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, petId } });
    if (!trip) throw new TripNotFoundException({ petId, tripId });
    return trip;
  }

  private async getRaw(tripId: string, requirementId: string) {
    const row = await this.prisma.travelRequirement.findFirst({ where: { id: requirementId, tripId }, include: REQUIREMENT_INCLUDE });
    if (!row) throw new TravelRequirementNotFoundException({ tripId, requirementId });
    return row;
  }

  /** Never trust a client-supplied documentId across pets (see the exception's own doc comment) — the document must belong to the same pet as the trip, and must not be voided. */
  private async assertDocumentBelongsToPet(petId: string, documentId: string) {
    const document = await this.prisma.medicalDocument.findUnique({ where: { id: documentId } });
    if (!document || document.petId !== petId || document.voidedAt) {
      throw new TravelRequirementDocumentMismatchException({ petId, documentId });
    }
  }

  async create(petId: string, tripId: string, dto: CreateTravelRequirementDto) {
    await this.getTripOrThrow(petId, tripId);
    const row = await this.prisma.travelRequirement.create({
      data: {
        tripId,
        requirementType: dto.requirementType,
        status: dto.status ?? TravelRequirementStatus.UNKNOWN,
        source: dto.source,
        sourceUrl: dto.sourceUrl,
        jurisdiction: dto.jurisdiction,
        notes: dto.notes,
      },
      include: REQUIREMENT_INCLUDE,
    });
    await this.events.publish("TravelRequirementUpdated", { petId, tripId, requirementId: row.id, status: row.status }, { aggregateType: "Pet", aggregateId: petId });
    return toTravelRequirementDto(row);
  }

  async list(petId: string, tripId: string) {
    await this.getTripOrThrow(petId, tripId);
    const rows = await this.prisma.travelRequirement.findMany({ where: { tripId }, include: REQUIREMENT_INCLUDE, orderBy: { createdAt: "asc" } });
    return rows.map(toTravelRequirementDto);
  }

  /**
   * markVerified always sets verifiedAt to "now" server-side — never
   * client-suppliable, and never implied by any other field change (spec:
   * "every requirement must retain... last verified date"). Linking a
   * document does NOT by itself set verifiedAt or advance status; a human
   * still confirms it's actually sufficient.
   */
  async update(petId: string, tripId: string, requirementId: string, dto: UpdateTravelRequirementDto) {
    await this.getTripOrThrow(petId, tripId);
    await this.getRaw(tripId, requirementId);

    if (dto.linkedMedicalDocumentId) {
      await this.assertDocumentBelongsToPet(petId, dto.linkedMedicalDocumentId);
    }

    const row = await this.prisma.travelRequirement.update({
      where: { id: requirementId },
      data: {
        status: dto.status,
        source: dto.source,
        sourceUrl: dto.sourceUrl,
        jurisdiction: dto.jurisdiction,
        verifiedAt: dto.markVerified ? new Date() : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        linkedMedicalDocumentId: dto.linkedMedicalDocumentId === undefined ? undefined : dto.linkedMedicalDocumentId,
        notes: dto.notes,
      },
      include: REQUIREMENT_INCLUDE,
    });
    await this.events.publish("TravelRequirementUpdated", { petId, tripId, requirementId: row.id, status: row.status }, { aggregateType: "Pet", aggregateId: petId });
    return toTravelRequirementDto(row);
  }

  async delete(petId: string, tripId: string, requirementId: string) {
    await this.getTripOrThrow(petId, tripId);
    await this.getRaw(tripId, requirementId);
    await this.prisma.travelRequirement.delete({ where: { id: requirementId } });
  }

  /** Suggested requirement types for the trip's destination that the trip does not already have a requirement row for — a starting checklist only, never auto-created. */
  async getSuggestedRequirementTypes(petId: string, tripId: string) {
    const trip = await this.getTripOrThrow(petId, tripId);
    const existing = await this.prisma.travelRequirement.findMany({ where: { tripId }, select: { requirementType: true } });
    const existingTypes = new Set(existing.map((r) => r.requirementType));
    return getSuggestedRequirementTypes(trip.destinationCountry).filter((type) => !existingTypes.has(type));
  }

  /**
   * Purely derived, never a stored duplicate — recomputed on every read
   * (same convention as H18's Life Timeline). allReady is only ever true
   * when EVERY requirement is READY or NOT_REQUIRED; an empty checklist is
   * deliberately NOT "ready" (totalCount === 0 forces allReady to false) so
   * an untouched trip can never present as travel-ready.
   */
  async getReadinessSummary(petId: string, tripId: string): Promise<TripReadinessSummaryDto> {
    const trip = await this.getTripOrThrow(petId, tripId);
    const rows = await this.prisma.travelRequirement.findMany({ where: { tripId }, include: REQUIREMENT_INCLUDE, orderBy: { createdAt: "asc" } });
    const requirements = rows.map(toTravelRequirementDto);
    const readyCount = requirements.filter((r) => READY_FOR_TRAVEL_STATUSES.includes(r.status)).length;
    return {
      tripId,
      status: trip.status as unknown as TripReadinessSummaryDto["status"],
      requirements,
      readyCount,
      totalCount: requirements.length,
      allReady: requirements.length > 0 && readyCount === requirements.length,
      hasStaleRequirement: requirements.some((r) => r.isStale),
    };
  }
}
