import { Injectable } from "@nestjs/common";
import { LostPetIncidentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { InvalidLostPetIncidentTransitionException, LostPetIncidentNotFoundException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../../common/pagination/pagination.dto";
import { resolveObjectUrl } from "../../storage/object-url.util";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

const CLOSABLE: LostPetIncidentStatus[] = [LostPetIncidentStatus.OPEN, LostPetIncidentStatus.SEARCHING, LostPetIncidentStatus.SIGHTING_REPORTED, LostPetIncidentStatus.FOUND, LostPetIncidentStatus.REUNITED];

/**
 * Batch 6 — Lost Pet operations for admins. The operational view never carries the exact
 * location or private notes: those are revealed on request, one incident at a time, under
 * `customer.pii.reveal`, and every reveal is audited (same model as Customer 360 PII).
 */
@Injectable()
export class AdminLostPetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly events: DomainEventsService,
  ) {}

  async list(query: { status?: LostPetIncidentStatus; q?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.LostPetIncidentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { OR: [{ pet: { name: { contains: query.q, mode: "insensitive" } } }, { publicArea: { contains: query.q, mode: "insensitive" } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.lostPetIncident.findMany({ where, include: { pet: { select: { name: true, species: true } }, _count: { select: { sightings: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take }),
      this.prisma.lostPetIncident.count({ where }),
    ]);
    return toPaginatedDto(
      rows.map((r) => ({ id: r.id, petName: r.pet.name, petSpecies: r.pet.species, status: r.status, publicArea: r.publicArea, sightingsCount: r._count.sightings, lastSeenAt: r.lastSeenAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() })),
      total,
      page,
      pageSize,
    );
  }

  async get(incidentId: string) {
    const row = await this.prisma.lostPetIncident.findUnique({ where: { id: incidentId }, include: { pet: { select: { id: true, name: true, species: true, breed: true } }, sightings: { orderBy: { createdAt: "desc" } } } });
    if (!row) throw new LostPetIncidentNotFoundException({ incidentId });
    const [history, posts, cases] = await Promise.all([
      this.prisma.adminAuditLog.findMany({ where: { entityType: "LOST_PET_INCIDENT", entityId: incidentId }, orderBy: { createdAt: "desc" }, take: 30, select: { action: true, reason: true, createdAt: true, adminUserId: true } }),
      this.prisma.communityPost.findMany({ where: { sourceLostPetIncidentId: incidentId }, select: { id: true, status: true, createdAt: true } }),
      this.prisma.supportCase.findMany({ where: { relatedEntityType: "LOST_PET_INCIDENT", relatedEntityId: incidentId }, select: { id: true, caseNumber: true, status: true, subject: true } }),
    ]);
    return {
      id: row.id,
      pet: row.pet,
      householdId: row.householdId,
      status: row.status,
      publicArea: row.publicArea,
      description: row.description,
      publicNotes: row.publicNotes,
      contactPreference: row.contactPreference,
      photoUrl: resolveObjectUrl(row.primaryPhotoObjectKey),
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      /** Masked: use the audited reveal endpoint. */
      exactLocationRecorded: Boolean(row.lastKnownLocation || row.lastKnownLatitude !== null),
      createdAt: row.createdAt.toISOString(),
      foundAt: row.foundAt?.toISOString() ?? null,
      reunitedAt: row.reunitedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      // Sightings without reporter identity or contact; location text only (the operator's own copy).
      sightings: row.sightings.map((s) => ({ id: s.id, status: s.status, seenAt: s.seenAt.toISOString(), location: s.location, description: s.description, hasPhoto: Boolean(s.photoObjectKey), fromSignedInUser: s.reporterUserId !== null, createdAt: s.createdAt.toISOString() })),
      history: history.map((h) => ({ action: h.action, reason: h.reason, createdAt: h.createdAt.toISOString() })),
      communityPosts: posts.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
      supportCases: cases,
    };
  }

  async revealLocation(admin: ResolvedAdminContext, incidentId: string, reason: string, requestId?: string) {
    const row = await this.prisma.lostPetIncident.findUnique({ where: { id: incidentId }, select: { lastKnownLocation: true, lastKnownLatitude: true, lastKnownLongitude: true, privateNotes: true } });
    if (!row) throw new LostPetIncidentNotFoundException({ incidentId });
    await this.audit.record({ adminUserId: admin.adminUserId, action: "lost_pet_incident.location_revealed", entityType: "LOST_PET_INCIDENT", entityId: incidentId, reason, requestId });
    return { lastKnownLocation: row.lastKnownLocation, lastKnownLatitude: row.lastKnownLatitude, lastKnownLongitude: row.lastKnownLongitude, privateNotes: row.privateNotes };
  }

  /**
   * Moderator close (e.g. a false or abusive report). The pet's lifecycle is left to the
   * household — a moderator never marks someone's pet safe or lost.
   */
  async close(admin: ResolvedAdminContext, incidentId: string, reason: string, requestId?: string) {
    const row = await this.prisma.lostPetIncident.findUnique({ where: { id: incidentId } });
    if (!row) throw new LostPetIncidentNotFoundException({ incidentId });
    if (!CLOSABLE.includes(row.status)) throw new InvalidLostPetIncidentTransitionException({ incidentId, from: row.status, to: LostPetIncidentStatus.CLOSED });
    await this.prisma.$transaction(async (tx) => {
      await tx.lostPetIncident.update({ where: { id: incidentId }, data: { status: LostPetIncidentStatus.CLOSED, closedAt: new Date() } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "lost_pet_incident.closed_by_moderator", entityType: "LOST_PET_INCIDENT", entityId: incidentId, reason, beforeSummary: { status: row.status }, afterSummary: { status: "CLOSED" }, requestId, tx });
      await this.events.publish("LostPetIncidentClosed", { petId: row.petId, incidentId, byModerator: true }, { tx, aggregateType: "Pet", aggregateId: row.petId });
    });
    return this.get(incidentId);
  }
}
