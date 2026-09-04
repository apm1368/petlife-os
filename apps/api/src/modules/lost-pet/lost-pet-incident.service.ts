import { Injectable } from "@nestjs/common";
import { CommunityPostType, CommunitySourceType, LostPetIncidentStatus, LostPetSightingStatus, PetLifecycleStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { StorageService } from "../storage/storage.service";
import { PetLifecycleService } from "../pets/pet-lifecycle.service";
import { CommunityPostService } from "../community/community-post.service";
import {
  InvalidLostPetIncidentTransitionException,
  LostPetIncidentAlreadyOpenException,
  LostPetIncidentNotFoundException,
  LostPetSightingNotFoundException,
} from "../../common/errors/api-exception";
import { toLostPetIncidentDto, toLostPetIncidentPublicDto, toLostPetSightingDto } from "./lost-pet-mapper";
import type { CreateLostPetIncidentDto, ReviewLostPetSightingDto, SubmitLostPetSightingDto } from "./dto/lost-pet.dto";

const INCIDENT_INCLUDE = { pet: true, _count: { select: { sightings: true } } } satisfies Prisma.LostPetIncidentInclude;

/** Open/active statuses — never more than one per pet at a time (spec + the DB's own partial unique index). */
const OPEN_STATUSES: LostPetIncidentStatus[] = [
  LostPetIncidentStatus.OPEN,
  LostPetIncidentStatus.SEARCHING,
  LostPetIncidentStatus.SIGHTING_REPORTED,
  LostPetIncidentStatus.FOUND,
];

/**
 * Explicit state table (spec: "Do not allow arbitrary status transitions").
 * A new sighting moves OPEN/SEARCHING -> SIGHTING_REPORTED but never
 * automatically further — "Do not automatically mark pet ACTIVE just
 * because a sighting occurred" and, symmetrically, a sighting alone never
 * advances the incident past SIGHTING_REPORTED on its own.
 */
const ALLOWED_TRANSITIONS: Record<LostPetIncidentStatus, LostPetIncidentStatus[]> = {
  [LostPetIncidentStatus.OPEN]: [LostPetIncidentStatus.SEARCHING, LostPetIncidentStatus.SIGHTING_REPORTED, LostPetIncidentStatus.FOUND, LostPetIncidentStatus.CLOSED],
  [LostPetIncidentStatus.SEARCHING]: [LostPetIncidentStatus.SIGHTING_REPORTED, LostPetIncidentStatus.FOUND, LostPetIncidentStatus.CLOSED],
  [LostPetIncidentStatus.SIGHTING_REPORTED]: [LostPetIncidentStatus.SEARCHING, LostPetIncidentStatus.FOUND, LostPetIncidentStatus.CLOSED],
  [LostPetIncidentStatus.FOUND]: [LostPetIncidentStatus.REUNITED, LostPetIncidentStatus.CLOSED],
  [LostPetIncidentStatus.REUNITED]: [LostPetIncidentStatus.CLOSED],
  [LostPetIncidentStatus.CLOSED]: [],
};

@Injectable()
export class LostPetIncidentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly storage: StorageService,
    private readonly lifecycle: PetLifecycleService,
    private readonly communityPosts: CommunityPostService,
  ) {}

  private async getRaw(petId: string, incidentId: string) {
    const incident = await this.prisma.lostPetIncident.findFirst({ where: { id: incidentId, petId }, include: INCIDENT_INCLUDE });
    if (!incident) throw new LostPetIncidentNotFoundException({ petId, incidentId });
    return incident;
  }

  private async assertTransition(current: LostPetIncidentStatus, next: LostPetIncidentStatus, incidentId: string) {
    if (!ALLOWED_TRANSITIONS[current].includes(next)) {
      throw new InvalidLostPetIncidentTransitionException({ incidentId, from: current, to: next });
    }
  }

  async open(petId: string, createdByUserId: string, dto: CreateLostPetIncidentDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const pet = await tx.pet.findUniqueOrThrow({ where: { id: petId } });
      const alreadyOpen = await tx.lostPetIncident.findFirst({ where: { petId, status: { in: OPEN_STATUSES } } });
      if (alreadyOpen) throw new LostPetIncidentAlreadyOpenException({ petId, existingIncidentId: alreadyOpen.id });

      const created = await tx.lostPetIncident.create({
        data: {
          petId,
          householdId: pet.householdId,
          description: dto.description,
          lastKnownLocation: dto.lastKnownLocation,
          lastKnownLatitude: dto.lastKnownLatitude,
          lastKnownLongitude: dto.lastKnownLongitude,
          lastSeenAt: dto.lastSeenAt ? new Date(dto.lastSeenAt) : undefined,
          publicNotes: dto.publicNotes,
          privateNotes: dto.privateNotes,
          primaryPhotoObjectKey: dto.primaryPhotoObjectKey,
          contactPreference: dto.contactPreference,
          publicContactMode: dto.publicContactMode,
          createdByUserId,
        },
        include: INCIDENT_INCLUDE,
      });

      await this.lifecycle.transition(tx, petId, PetLifecycleStatus.LOST, { sourceType: "LOST_PET_INCIDENT", sourceId: created.id, actorUserId: createdByUserId, reason: "Lost pet incident opened" });
      await this.events.publish("LostPetIncidentOpened", { petId, householdId: pet.householdId, incidentId: created.id }, { tx, aggregateType: "Pet", aggregateId: petId });
      return created;
    });
    return toLostPetIncidentDto(row);
  }

  async get(petId: string, incidentId: string) {
    return toLostPetIncidentDto(await this.getRaw(petId, incidentId));
  }

  /**
   * spec: "Lost Pet incident may optionally generate/share a community
   * post. But: LostPetIncident remains source of truth. Community post is
   * only a distribution surface. Closing/deleting the community post must
   * not close the incident." An explicit, household-triggered action —
   * never automatic on incident creation. The post carries only the same
   * public-safe fields already exposed on the public incident page (never
   * privateNotes/contactPreference/createdByUserId).
   */
  async shareToCommunity(petId: string, incidentId: string, actorUserId: string) {
    const incident = await this.getRaw(petId, incidentId);
    const bodyParts = [incident.description];
    if (incident.lastKnownLocation) bodyParts.push(`Last seen near: ${incident.lastKnownLocation}`);
    if (incident.publicNotes) bodyParts.push(incident.publicNotes);

    return this.communityPosts.createSourcedPost(actorUserId, {
      type: CommunityPostType.LOST_PET_SHARE,
      title: `Lost: ${incident.pet.name}`,
      body: bodyParts.join("\n\n"),
      petId,
      mediaObjectKeys: incident.primaryPhotoObjectKey ? [incident.primaryPhotoObjectKey] : [],
      sourceType: CommunitySourceType.LOST_PET_INCIDENT,
      sourceLostPetIncidentId: incidentId,
    });
  }

  async list(petId: string) {
    const rows = await this.prisma.lostPetIncident.findMany({ where: { petId }, include: INCIDENT_INCLUDE, orderBy: { createdAt: "desc" } });
    return rows.map(toLostPetIncidentDto);
  }

  async getPublic(incidentId: string) {
    const incident = await this.prisma.lostPetIncident.findFirst({
      where: { id: incidentId, status: { in: OPEN_STATUSES } },
      include: INCIDENT_INCLUDE,
    });
    if (!incident) throw new LostPetIncidentNotFoundException({ incidentId });
    return toLostPetIncidentPublicDto(incident);
  }

  async listPublic() {
    const rows = await this.prisma.lostPetIncident.findMany({
      where: { status: { in: OPEN_STATUSES } },
      include: INCIDENT_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map(toLostPetIncidentPublicDto);
  }

  async requestPhotoUpload(petId: string, contentType: string, fileSizeBytes: number) {
    return this.storage.createLostPetPhotoUploadTarget(petId, contentType, fileSizeBytes);
  }

  async markSearching(petId: string, incidentId: string) {
    const existing = await this.getRaw(petId, incidentId);
    await this.assertTransition(existing.status, LostPetIncidentStatus.SEARCHING, incidentId);
    await this.prisma.lostPetIncident.update({ where: { id: incidentId }, data: { status: LostPetIncidentStatus.SEARCHING } });
    return this.get(petId, incidentId);
  }

  async markFound(petId: string, incidentId: string) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.lostPetIncident.findFirst({ where: { id: incidentId, petId } });
      if (!existing) throw new LostPetIncidentNotFoundException({ petId, incidentId });
      await this.assertTransition(existing.status, LostPetIncidentStatus.FOUND, incidentId);
      const updated = await tx.lostPetIncident.update({ where: { id: incidentId }, data: { status: LostPetIncidentStatus.FOUND, foundAt: new Date() }, include: INCIDENT_INCLUDE });
      await this.events.publish("LostPetMarkedFound", { petId, incidentId }, { tx, aggregateType: "Pet", aggregateId: petId });
      return updated;
    });
    return toLostPetIncidentDto(row);
  }

  /**
   * Reunification returns Pet.lifecycleStatus to ACTIVE — the one and only
   * place this happens (spec: "Reunification may return lifecycle to
   * ACTIVE. This must happen through explicit domain logic").
   */
  async reunite(petId: string, incidentId: string, actorUserId: string) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.lostPetIncident.findFirst({ where: { id: incidentId, petId } });
      if (!existing) throw new LostPetIncidentNotFoundException({ petId, incidentId });
      await this.assertTransition(existing.status, LostPetIncidentStatus.REUNITED, incidentId);
      const updated = await tx.lostPetIncident.update({ where: { id: incidentId }, data: { status: LostPetIncidentStatus.REUNITED, reunitedAt: new Date() }, include: INCIDENT_INCLUDE });
      await this.lifecycle.transition(tx, petId, PetLifecycleStatus.ACTIVE, { sourceType: "LOST_PET_INCIDENT", sourceId: incidentId, actorUserId, reason: "Pet reunited with household" });
      await this.events.publish("LostPetReunited", { petId, incidentId }, { tx, aggregateType: "Pet", aggregateId: petId });
      return updated;
    });
    return toLostPetIncidentDto(row);
  }

  async close(petId: string, incidentId: string, reason?: string) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.lostPetIncident.findFirst({ where: { id: incidentId, petId } });
      if (!existing) throw new LostPetIncidentNotFoundException({ petId, incidentId });
      await this.assertTransition(existing.status, LostPetIncidentStatus.CLOSED, incidentId);
      const updated = await tx.lostPetIncident.update({
        where: { id: incidentId },
        data: { status: LostPetIncidentStatus.CLOSED, closedAt: new Date(), privateNotes: reason ? `${existing.privateNotes ?? ""}\n[Closed] ${reason}`.trim() : existing.privateNotes },
        include: INCIDENT_INCLUDE,
      });
      await this.events.publish("LostPetIncidentClosed", { petId, incidentId }, { tx, aggregateType: "Pet", aggregateId: petId });
      return updated;
    });
    return toLostPetIncidentDto(row);
  }

  // -- Sightings ---------------------------------------------------------

  /**
   * Anonymous-safe: reporterUserId is whatever OptionalSessionAuthGuard
   * resolved (may be undefined). A new sighting moves OPEN/SEARCHING ->
   * SIGHTING_REPORTED but never further on its own (see ALLOWED_TRANSITIONS
   * doc comment) — never auto-marks the pet ACTIVE.
   */
  async submitSighting(incidentId: string, reporterUserId: string | undefined, dto: SubmitLostPetSightingDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const incident = await tx.lostPetIncident.findFirst({ where: { id: incidentId, status: { in: OPEN_STATUSES } } });
      if (!incident) throw new LostPetIncidentNotFoundException({ incidentId });

      const sighting = await tx.lostPetSighting.create({
        data: {
          incidentId,
          reporterUserId,
          reporterContactToken: dto.reporterContactToken,
          location: dto.location,
          latitude: dto.latitude,
          longitude: dto.longitude,
          seenAt: new Date(dto.seenAt),
          description: dto.description,
          photoObjectKey: dto.photoObjectKey,
        },
      });

      if (incident.status === LostPetIncidentStatus.OPEN || incident.status === LostPetIncidentStatus.SEARCHING) {
        await tx.lostPetIncident.update({ where: { id: incidentId }, data: { status: LostPetIncidentStatus.SIGHTING_REPORTED } });
      }

      await this.events.publish("LostPetSightingSubmitted", { incidentId, sightingId: sighting.id, petId: incident.petId }, { tx, aggregateType: "Pet", aggregateId: incident.petId });
      return sighting;
    });
    return toLostPetSightingDto(row);
  }

  async requestSightingPhotoUpload(incidentId: string, contentType: string, fileSizeBytes: number) {
    return this.storage.createLostPetSightingPhotoUploadTarget(incidentId, contentType, fileSizeBytes);
  }

  async listSightings(petId: string, incidentId: string) {
    await this.getRaw(petId, incidentId);
    const rows = await this.prisma.lostPetSighting.findMany({ where: { incidentId }, orderBy: { createdAt: "desc" } });
    return rows.map(toLostPetSightingDto);
  }

  async reviewSighting(petId: string, incidentId: string, sightingId: string, reviewerUserId: string, dto: ReviewLostPetSightingDto) {
    await this.getRaw(petId, incidentId);
    const sighting = await this.prisma.lostPetSighting.findFirst({ where: { id: sightingId, incidentId } });
    if (!sighting) throw new LostPetSightingNotFoundException({ incidentId, sightingId });

    const nextStatus = dto.decision === "ACCEPTED" ? LostPetSightingStatus.ACCEPTED : LostPetSightingStatus.REJECTED;
    const updated = await this.prisma.lostPetSighting.update({ where: { id: sightingId }, data: { status: nextStatus, reviewedAt: new Date(), reviewedByUserId: reviewerUserId } });

    if (dto.decision === "ACCEPTED") {
      await this.events.publish("LostPetSightingAccepted", { incidentId, sightingId, petId }, { aggregateType: "Pet", aggregateId: petId });
    }
    return toLostPetSightingDto(updated);
  }
}
