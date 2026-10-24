import { Injectable } from "@nestjs/common";
import { HouseholdRole, LostPetIncidentStatus, PetAccessSource, type Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../../common/pagination/pagination.dto";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN_LOST: LostPetIncidentStatus[] = [LostPetIncidentStatus.OPEN, LostPetIncidentStatus.SEARCHING, LostPetIncidentStatus.SIGHTING_REPORTED];
const FLAGS = ["canViewIdentity", "canEditIdentity", "canViewHealth", "canEditHealth", "canBookCare", "canViewCareProfile", "canEditCareProfile", "canViewLocation", "canManageAccess", "canRecordClinicalData"] as const;

export type PetDiagnosticCode = "NO_ACTIVE_OWNER" | "STALE_HOUSEHOLD_GRANT" | "EXPIRED_GRANT_NOT_REVOKED" | "MEMBER_WITHOUT_GRANT" | "LONG_OPEN_LOST_INCIDENT" | "DELETED_BUT_ACTIVE";

/**
 * ERP-B Pet 360: operational view of one pet — identity, household, grants with provenance, health *metadata*
 * (counts, document types and dates — never clinical text or file contents), bookings, lost incidents (public area
 * only, no coordinates), care, travel, insurance and recent activity — plus data-quality diagnostics.
 * The only mutation is revoking a stale non-owner grant; there is no ownership transfer here.
 */
@Injectable()
export class AdminPet360Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly events: DomainEventsService,
  ) {}

  async search(q: { q?: string; species?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination(q);
    const term = q.q?.trim();
    const digits = term?.replace(/\D/g, "") ?? "";
    const where: Prisma.PetWhereInput = {
      ...(q.species ? { species: q.species as never } : {}),
      ...(term ? { OR: [...(UUID.test(term) ? [{ id: term }, { householdId: term }] : []), { name: { contains: term, mode: "insensitive" as const } }, ...(digits.length >= 9 ? [{ microchipNormalized: digits }] : [])] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.pet.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { household: { select: { id: true, name: true } } } }),
      this.prisma.pet.count({ where }),
    ]);
    return toPaginatedDto(rows.map((p) => ({ id: p.id, name: p.name, species: p.species, breed: p.breed, lifecycleStatus: p.lifecycleStatus, deleted: Boolean(p.deletedAt), household: p.household, createdAt: p.createdAt.toISOString() })), total, page, pageSize);
  }

  async get(petId: string) {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId }, include: { household: { include: { members: { include: { user: { select: { id: true, displayName: true, accountStatus: true } } } } } } } });
    if (!pet) throw new NotFoundApiException("Pet");
    const now = new Date();
    const [grants, documents, docTypes, visits, labs, meds, conditions, allergies, bookings, lost, reminders, trips, insuranceApps, claimPreps, shareCards, healthShares, activity] = await Promise.all([
      this.prisma.petAccessGrant.findMany({ where: { petId }, orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, displayName: true } } } }),
      this.prisma.medicalDocument.count({ where: { petId, voidedAt: null } }),
      this.prisma.medicalDocument.groupBy({ by: ["documentType", "sourceType"], where: { petId, voidedAt: null }, _count: { _all: true }, _max: { createdAt: true } }),
      this.prisma.clinicalVisit.count({ where: { petId } }),
      this.prisma.labResult.count({ where: { petId } }),
      this.prisma.medication.groupBy({ by: ["status"], where: { petId }, _count: { _all: true } }),
      this.prisma.condition.count({ where: { petId } }),
      this.prisma.allergy.count({ where: { petId } }),
      this.prisma.booking.findMany({ where: { petId }, orderBy: { startAt: "desc" }, take: 10, select: { id: true, category: true, bookingStatus: true, startAt: true, providerOrganizationId: true } }),
      this.prisma.lostPetIncident.findMany({ where: { petId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, status: true, publicArea: true, lastSeenAt: true, createdAt: true, reunitedAt: true, closedAt: true, _count: { select: { sightings: true } } } }),
      this.prisma.careReminder.groupBy({ by: ["state"], where: { petId }, _count: { _all: true } }),
      this.prisma.trip.findMany({ where: { petId }, orderBy: { departAt: "desc" }, take: 5, select: { id: true, status: true, destinationCountry: true, destinationCity: true, departAt: true } }),
      this.prisma.insuranceApplication.groupBy({ by: ["status"], where: { petId }, _count: { _all: true } }),
      this.prisma.insuranceClaimPrep.count({ where: { petId } }),
      this.prisma.petShareCard.count({ where: { petId, revokedAt: null } }),
      this.prisma.healthShareLink.count({ where: { petId, revokedAt: null, expiresAt: { gt: now } } }),
      this.prisma.domainEvent.findMany({ where: { aggregateType: "Pet", aggregateId: petId }, orderBy: { occurredAt: "desc" }, take: 20, select: { id: true, type: true, occurredAt: true } }),
    ]);
    const memberIds = new Set(pet.household.members.map((m) => m.userId));
    const activeGrant = (g: (typeof grants)[number]) => !g.revokedAt && (!g.expiresAt || g.expiresAt > now) && (!g.startsAt || g.startsAt <= now);
    const diagnostics: { code: PetDiagnosticCode; severity: "WARNING" | "INFO"; entityId?: string; detail?: Record<string, unknown> }[] = [];
    if (!pet.household.members.some((m) => m.role === HouseholdRole.OWNER)) diagnostics.push({ code: "NO_ACTIVE_OWNER", severity: "WARNING" });
    for (const g of grants) {
      if (!g.revokedAt && g.source === PetAccessSource.HOUSEHOLD && !memberIds.has(g.userId)) diagnostics.push({ code: "STALE_HOUSEHOLD_GRANT", severity: "WARNING", entityId: g.id });
      if (!g.revokedAt && g.expiresAt && g.expiresAt <= now) diagnostics.push({ code: "EXPIRED_GRANT_NOT_REVOKED", severity: "INFO", entityId: g.id });
    }
    for (const m of pet.household.members) if (!grants.some((g) => g.userId === m.userId && activeGrant(g))) diagnostics.push({ code: "MEMBER_WITHOUT_GRANT", severity: "INFO", entityId: m.userId, detail: { role: m.role } });
    for (const l of lost) if (OPEN_LOST.includes(l.status) && now.getTime() - l.createdAt.getTime() > 90 * 86400e3) diagnostics.push({ code: "LONG_OPEN_LOST_INCIDENT", severity: "INFO", entityId: l.id });
    if (pet.deletedAt && pet.lifecycleStatus === "ACTIVE") diagnostics.push({ code: "DELETED_BUT_ACTIVE", severity: "WARNING" });
    const chip = pet.microchipNumber;
    return {
      identity: { id: pet.id, name: pet.name, species: pet.species, breed: pet.breed, sex: pet.sex, birthDate: iso(pet.birthDate), approximateAgeMonths: pet.approximateAgeMonths, neuteredStatus: pet.neuteredStatus, microchipMasked: chip ? `${chip.slice(0, 3)}***${chip.slice(-3)}` : null, lifecycleStatus: pet.lifecycleStatus, deletedAt: iso(pet.deletedAt), createdAt: iso(pet.createdAt), hasPhoto: Boolean(pet.photoUrl) },
      household: { id: pet.household.id, name: pet.household.name, city: pet.household.city, members: pet.household.members.map((m) => ({ userId: m.userId, displayName: m.user.displayName, role: m.role, accountStatus: m.user.accountStatus })) },
      accessGrants: grants.map((g) => ({ id: g.id, user: g.user, source: g.source, reason: g.reason, flags: Object.fromEntries(FLAGS.map((f) => [f, g[f]])), healthScopes: g.healthScopes, startsAt: iso(g.startsAt), expiresAt: iso(g.expiresAt), revokedAt: iso(g.revokedAt), active: activeGrant(g), grantedByUserId: g.grantedByUserId, isHouseholdMember: memberIds.has(g.userId), createdAt: g.createdAt.toISOString() })),
      health: { documents, documentsByType: docTypes.map((d) => ({ documentType: d.documentType, sourceType: d.sourceType, count: d._count._all, latestAt: iso(d._max.createdAt) })), clinicalVisits: visits, labResults: labs, medications: Object.fromEntries(meds.map((m) => [m.status, m._count._all])), conditions, allergies },
      bookings: bookings.map((b) => ({ ...b, startAt: b.startAt.toISOString() })),
      lostIncidents: lost.map((l) => ({ id: l.id, status: l.status, publicArea: l.publicArea, lastSeenAt: iso(l.lastSeenAt), createdAt: l.createdAt.toISOString(), reunitedAt: iso(l.reunitedAt), closedAt: iso(l.closedAt), sightings: l._count.sightings })),
      care: { reminders: Object.fromEntries(reminders.map((r) => [r.state, r._count._all])) },
      travel: trips.map((t) => ({ ...t, departAt: t.departAt.toISOString() })),
      insurance: { applications: Object.fromEntries(insuranceApps.map((a) => [a.status, a._count._all])), claimPreps },
      sharing: { activeShareCards: shareCards, activeHealthShares: healthShares },
      activity: activity.map((a) => ({ id: a.id, type: a.type, at: a.occurredAt.toISOString() })),
      diagnostics,
    };
  }

  /** Revoke one non-owner grant (stale membership, expired temporary access, mistaken share). Owner access is never revoked here. */
  async revokeGrant(admin: ResolvedAdminContext, petId: string, grantId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const grant = await tx.petAccessGrant.findFirst({ where: { id: grantId, petId } });
      if (!grant) throw new NotFoundApiException("Access grant");
      if (grant.revokedAt) throw new ValidationApiException({ field: "grantId", reason: "ALREADY_REVOKED" });
      const owner = await tx.householdMember.count({ where: { userId: grant.userId, role: HouseholdRole.OWNER, household: { pets: { some: { id: petId } } } } });
      if (owner) throw new ValidationApiException({ field: "grantId", reason: "OWNER_GRANT" });
      const done = await tx.petAccessGrant.updateMany({ where: { id: grantId, revokedAt: null }, data: { revokedAt: new Date(), revokedByUserId: admin.userId } });
      if (!done.count) throw new ValidationApiException({ field: "grantId", reason: "ALREADY_REVOKED" });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "pet.access_revoked_by_admin", entityType: "Pet", entityId: petId, reason, afterSummary: { grantId, targetUserId: grant.userId, source: grant.source }, tx });
      await this.events.publish("PetAccessRevoked", { petId, grantId, actorUserId: admin.userId, actorAdminUserId: admin.adminUserId, targetUserId: grant.userId }, { tx, aggregateType: "Pet", aggregateId: petId });
      return { ok: true, grantId };
    });
  }
}
