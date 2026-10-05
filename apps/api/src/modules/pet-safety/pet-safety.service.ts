import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { AllergyStatus, ConditionStatus, LostPetIncidentStatus, MedicationStatus, PetAccessSource, PetShareCardKind, Prisma } from "@prisma/client";
import type { PetAccessFlags } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { HouseholdAccessDeniedException, NotFoundApiException, PetAccessDeniedException, ValidationApiException } from "../../common/errors/api-exception";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import type { CareHandoffScope, CreateCareHandoffDto, CreateShareCardDto, UpsertEmergencyInfoDto } from "./pet-safety.dto";

const HANDOFF_REASON = "CARE_HANDOFF";
const EMERGENCY_SCOPE = "EMERGENCY_SNAPSHOT";
const MAX_HANDOFF_MS = 30 * 86400e3;
const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/**
 * Pet safety: a server-derived profile completeness, owner-entered emergency info, owner-controlled public share
 * cards (short-lived EMERGENCY card, QR-ready ID_TAG) and time-boxed care handoffs to people outside the household.
 * Nothing here ever exposes the full health record: the emergency snapshot is allergies, active conditions,
 * active medications and the owner's emergency facts only.
 */
@Injectable()
export class PetSafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly notifications: NotificationOrchestratorService,
  ) {}

  // ---------------------------------------------------------------- completeness

  async completeness(petId: string) {
    const pet = await this.prisma.pet.findUniqueOrThrow({ where: { id: petId }, include: { emergencyInfo: true, vaccinationSummary: true } });
    const [documents, vaccinationDocs] = await Promise.all([
      this.prisma.medicalDocument.count({ where: { petId, voidedAt: null } }),
      this.prisma.medicalDocument.count({ where: { petId, voidedAt: null, documentType: "VACCINATION_CERTIFICATE" } }),
    ]);
    const checks: [string, boolean][] = [
      ["photo", Boolean(pet.photoUrl)],
      ["species", Boolean(pet.species)],
      ["breed", Boolean(pet.breed?.trim())],
      ["sex", Boolean(pet.sex && pet.sex !== "UNKNOWN")],
      ["birthDate", Boolean(pet.birthDate || pet.approximateAgeMonths !== null)],
      ["weight", pet.latestWeightValue !== null],
      ["microchip", Boolean(pet.microchipNumber)],
      ["emergencyContact", Boolean(pet.emergencyInfo?.contactPhone)],
      ["vaccinationHistory", Boolean(pet.vaccinationSummary?.lastKnownDate) || vaccinationDocs > 0],
      ["medicalDocument", documents > 0],
    ];
    const completedFields = checks.filter(([, ok]) => ok).map(([k]) => k);
    const missingFields = checks.filter(([, ok]) => !ok).map(([k]) => k);
    return { petId, completedFields, missingFields, completionScore: Math.round((completedFields.length / checks.length) * 100) };
  }

  // ---------------------------------------------------------------- emergency info

  async getEmergencyInfo(petId: string) {
    const row = await this.prisma.petEmergencyInfo.findUnique({ where: { petId } });
    return toEmergencyInfoDto(row);
  }

  async upsertEmergencyInfo(petId: string, userId: string, dto: UpsertEmergencyInfoDto) {
    const clean = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : v.trim() || null);
    const data = { contactName: clean(dto.contactName), contactPhone: clean(dto.contactPhone), contactRelation: clean(dto.contactRelation), bloodType: clean(dto.bloodType), criticalNotes: clean(dto.criticalNotes), updatedByUserId: userId };
    const row = await this.prisma.petEmergencyInfo.upsert({ where: { petId }, create: { petId, ...data }, update: data });
    await this.events.publish("PetEmergencyInfoUpdated", { petId, actorUserId: userId }, { aggregateType: "Pet", aggregateId: petId });
    return toEmergencyInfoDto(row);
  }

  /** The emergency snapshot: identity, allergies, active conditions, active medications and owner emergency facts. */
  async emergencySnapshot(petId: string, includeContact = true) {
    const pet = await this.prisma.pet.findUniqueOrThrow({
      where: { id: petId },
      include: {
        emergencyInfo: true,
        allergies: { where: { status: AllergyStatus.ACTIVE }, select: { name: true, reaction: true, severity: true }, orderBy: { name: "asc" } },
        conditions: { where: { status: ConditionStatus.ACTIVE }, select: { name: true }, orderBy: { name: "asc" } },
        medications: { where: { status: MedicationStatus.ACTIVE }, select: { name: true, dosage: true, unit: true, frequencyText: true }, orderBy: { name: "asc" } },
      },
    });
    return {
      ...identity(pet),
      allergies: pet.allergies.map((a) => ({ name: a.name, reaction: a.reaction, severity: a.severity })),
      activeConditions: pet.conditions.map((c) => c.name),
      activeMedications: pet.medications.map((m) => ({ name: m.name, dosage: m.dosage?.toString() ?? null, unit: m.unit, frequency: m.frequencyText })),
      bloodType: pet.emergencyInfo?.bloodType ?? null,
      criticalNotes: pet.emergencyInfo?.criticalNotes ?? null,
      emergencyContact: includeContact ? contactOf(pet.emergencyInfo) : null,
    };
  }

  /** Household readers with health access, or a care-handoff recipient holding the EMERGENCY_HEALTH scope. */
  async emergencySnapshotFor(petId: string, userId: string, flags: PetAccessFlags) {
    if (!flags.canViewHealth) {
      const now = new Date();
      const scoped = await this.prisma.petAccessGrant.count({
        where: { petId, userId, revokedAt: null, healthScopes: { has: EMERGENCY_SCOPE }, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] },
      });
      if (!scoped) throw new PetAccessDeniedException({ petId, reason: "EMERGENCY_SCOPE_REQUIRED" });
    }
    return this.emergencySnapshot(petId);
  }

  // ---------------------------------------------------------------- share cards

  async listCards(petId: string) {
    const rows = await this.prisma.petShareCard.findMany({ where: { petId }, orderBy: { createdAt: "desc" }, take: 20 });
    const now = new Date();
    return rows.map((c) => toCardDto(c, now));
  }

  /** Creates the card (revoking any active one of the same kind) and returns the raw token exactly once. */
  async createCard(petId: string, userId: string, dto: CreateShareCardDto) {
    const kind = dto.kind as PetShareCardKind;
    if (kind === PetShareCardKind.EMERGENCY && dto.expiresInHours === undefined) dto.expiresInHours = 72;
    const expiresAt = dto.expiresInHours ? new Date(Date.now() + dto.expiresInHours * 3600e3) : null;
    const raw = randomBytes(24).toString("base64url");
    const card = await this.prisma.$transaction(async (tx) => {
      await tx.petShareCard.updateMany({ where: { petId, kind, revokedAt: null }, data: { revokedAt: new Date() } });
      const row = await tx.petShareCard.create({ data: { petId, kind, tokenHash: hashToken(raw), tokenHint: raw.slice(-4), includeContact: dto.includeContact ?? true, expiresAt, createdByUserId: userId } });
      await this.events.publish("PetShareCardCreated", { petId, cardId: row.id, kind, actorUserId: userId, expiresAt }, { aggregateType: "Pet", aggregateId: petId, tx });
      return row;
    });
    return { ...toCardDto(card, new Date()), token: raw, publicPath: `/pet-card/${raw}` };
  }

  /** New token, same settings; the old link stops working immediately. */
  async rotateCard(petId: string, cardId: string, userId: string) {
    const card = await this.prisma.petShareCard.findFirst({ where: { id: cardId, petId, revokedAt: null } });
    if (!card) throw new NotFoundApiException("PetShareCard");
    const hours = card.expiresAt ? Math.max(1, Math.round((card.expiresAt.getTime() - Date.now()) / 3600e3)) : undefined;
    return this.createCard(petId, userId, { kind: card.kind, includeContact: card.includeContact, expiresInHours: hours ? Math.min(hours, 720) : undefined });
  }

  async revokeCard(petId: string, cardId: string, userId: string) {
    const done = await this.prisma.petShareCard.updateMany({ where: { id: cardId, petId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!done.count) throw new NotFoundApiException("PetShareCard");
    await this.events.publish("PetShareCardRevoked", { petId, cardId, actorUserId: userId }, { aggregateType: "Pet", aggregateId: petId });
    return { revoked: true };
  }

  /** Public read by token. Unknown, revoked and expired tokens all look the same (404). */
  async readPublicCard(rawToken: string) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(rawToken)) throw new NotFoundApiException("PetCard");
    const now = new Date();
    const card = await this.prisma.petShareCard.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!card || card.revokedAt || (card.expiresAt && card.expiresAt <= now)) throw new NotFoundApiException("PetCard");
    await this.prisma.petShareCard.update({ where: { id: card.id }, data: { lastAccessedAt: now, accessCount: { increment: 1 } } });
    if (card.kind === PetShareCardKind.EMERGENCY) return { kind: card.kind, expiresAt: card.expiresAt?.toISOString() ?? null, ...(await this.emergencySnapshot(card.petId, card.includeContact)) };
    const pet = await this.prisma.pet.findUniqueOrThrow({ where: { id: card.petId }, include: { emergencyInfo: true } });
    const lost = await this.prisma.lostPetIncident.findFirst({ where: { petId: card.petId, status: { in: [LostPetIncidentStatus.OPEN, LostPetIncidentStatus.SEARCHING, LostPetIncidentStatus.SIGHTING_REPORTED] } }, select: { id: true } });
    return { kind: card.kind, expiresAt: card.expiresAt?.toISOString() ?? null, ...identity(pet), isReportedLost: Boolean(lost), lostIncidentId: lost?.id ?? null, emergencyContact: card.includeContact ? contactOf(pet.emergencyInfo) : null };
  }

  // ---------------------------------------------------------------- care handoffs

  async listHandoffs(petId: string) {
    const rows = await this.prisma.petAccessGrant.findMany({ where: { petId, reason: HANDOFF_REASON }, orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { displayName: true } } } });
    const now = new Date();
    return rows.map((g) => toHandoffDto(g, now));
  }

  /**
   * Time-boxed access for a sitter/walker/relative outside the household. Scopes map onto existing grant flags:
   * BASIC_PROFILE → identity; CARE → view/edit care; BOOKINGS → book care; EMERGENCY_HEALTH → the emergency
   * snapshot only (never canViewHealth). The granter can't hand out what they don't hold themselves.
   */
  async createHandoff(petId: string, actorUserId: string, actorFlags: PetAccessFlags, dto: CreateCareHandoffDto) {
    const target = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() }, select: { id: true } });
    if (!target) throw new NotFoundApiException("User");
    if (target.id === actorUserId) throw new ValidationApiException({ field: "email", reason: "CANNOT_HANDOFF_TO_SELF" });
    const pet = await this.prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { householdId: true, name: true } });
    if (await this.prisma.householdMember.count({ where: { householdId: pet.householdId, userId: target.id } })) throw new ValidationApiException({ field: "email", reason: "HOUSEHOLD_MEMBER_USE_ACCESS_SETTINGS" });
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const expiresAt = new Date(dto.expiresAt);
    if (expiresAt <= startsAt || expiresAt <= new Date()) throw new ValidationApiException({ field: "expiresAt", reason: "MUST_BE_AFTER_START_AND_IN_FUTURE" });
    if (expiresAt.getTime() - startsAt.getTime() > MAX_HANDOFF_MS) throw new ValidationApiException({ field: "expiresAt", reason: "MAX_30_DAYS" });

    const scopes = new Set<CareHandoffScope>(["BASIC_PROFILE", ...dto.scopes]);
    const flags = {
      canViewIdentity: true,
      canViewCareProfile: scopes.has("CARE"),
      canEditCareProfile: scopes.has("CARE"),
      canBookCare: scopes.has("BOOKINGS"),
    };
    const needs: [boolean, boolean][] = [[flags.canEditCareProfile, actorFlags.canEditCareProfile], [flags.canBookCare, actorFlags.canBookCare], [scopes.has("EMERGENCY_HEALTH"), actorFlags.canViewHealth]];
    if (needs.some(([wanted, held]) => wanted && !held)) throw new HouseholdAccessDeniedException();

    const grant = await this.prisma.$transaction(async (tx) => {
      const row = await tx.petAccessGrant.create({
        data: { petId, userId: target.id, ...flags, healthScopes: scopes.has("EMERGENCY_HEALTH") ? [EMERGENCY_SCOPE] : [], startsAt, expiresAt, reason: HANDOFF_REASON, source: PetAccessSource.TEMPORARY, grantedByUserId: actorUserId },
        include: { user: { select: { displayName: true } } },
      });
      await this.events.publish("PetCareHandoffGranted", { petId, grantId: row.id, actorUserId, targetUserId: target.id, scopes: [...scopes], startsAt, expiresAt }, { aggregateType: "Pet", aggregateId: petId, tx });
      return row;
    });
    await this.notifications.notify({
      userId: target.id,
      type: "pet.care_handoff_granted",
      category: "PET_ACCESS",
      petId,
      deepLink: NotificationDeepLinks.pet(petId),
      entityType: "PetAccessGrant",
      entityId: grant.id,
      templateParams: { petName: pet.name },
    });
    return toHandoffDto(grant, new Date());
  }

  async revokeHandoff(petId: string, grantId: string, actorUserId: string) {
    const done = await this.prisma.petAccessGrant.updateMany({ where: { id: grantId, petId, reason: HANDOFF_REASON, revokedAt: null }, data: { revokedAt: new Date(), revokedByUserId: actorUserId } });
    if (!done.count) throw new NotFoundApiException("CareHandoff");
    await this.events.publish("PetCareHandoffRevoked", { petId, grantId, actorUserId }, { aggregateType: "Pet", aggregateId: petId });
    return { revoked: true };
  }

  /** Pets handed to me, current or upcoming. */
  async myHandoffs(userId: string) {
    const now = new Date();
    const rows = await this.prisma.petAccessGrant.findMany({
      where: { userId, reason: HANDOFF_REASON, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { startsAt: "asc" },
      include: { pet: { select: { id: true, name: true, species: true, photoUrl: true } }, user: { select: { displayName: true } } },
    });
    return rows.map((g) => ({ ...toHandoffDto(g, now), pet: g.pet }));
  }
}

type PetIdentity = { id: string; name: string; species: string; breed: string | null; sex: string | null; photoUrl: string | null; birthDate: Date | null; approximateAgeMonths: number | null; microchipNumber: string | null };
function identity(p: PetIdentity) {
  return { petId: p.id, name: p.name, species: p.species, breed: p.breed, sex: p.sex, photoUrl: p.photoUrl, birthDate: p.birthDate?.toISOString().slice(0, 10) ?? null, approximateAgeMonths: p.approximateAgeMonths, microchipNumber: p.microchipNumber };
}
function contactOf(e: { contactName: string | null; contactPhone: string | null; contactRelation: string | null } | null) {
  return e?.contactPhone ? { name: e.contactName, phone: e.contactPhone, relation: e.contactRelation } : null;
}
function toEmergencyInfoDto(r: Prisma.PetEmergencyInfoGetPayload<object> | null) {
  return { contactName: r?.contactName ?? null, contactPhone: r?.contactPhone ?? null, contactRelation: r?.contactRelation ?? null, bloodType: r?.bloodType ?? null, criticalNotes: r?.criticalNotes ?? null, updatedAt: r?.updatedAt.toISOString() ?? null };
}
function toCardDto(c: Prisma.PetShareCardGetPayload<object>, now: Date) {
  const state = c.revokedAt ? "REVOKED" : c.expiresAt && c.expiresAt <= now ? "EXPIRED" : "ACTIVE";
  return { id: c.id, kind: c.kind, state, tokenHint: c.tokenHint, includeContact: c.includeContact, expiresAt: c.expiresAt?.toISOString() ?? null, revokedAt: c.revokedAt?.toISOString() ?? null, lastAccessedAt: c.lastAccessedAt?.toISOString() ?? null, accessCount: c.accessCount, createdAt: c.createdAt.toISOString() };
}
function toHandoffDto(g: Prisma.PetAccessGrantGetPayload<{ include: { user: { select: { displayName: true } } } }>, now: Date) {
  const scopes = ["BASIC_PROFILE", ...(g.canEditCareProfile ? ["CARE"] : []), ...(g.canBookCare ? ["BOOKINGS"] : []), ...(g.healthScopes.includes(EMERGENCY_SCOPE) ? ["EMERGENCY_HEALTH"] : [])];
  const state = g.revokedAt ? "REVOKED" : g.expiresAt && g.expiresAt <= now ? "EXPIRED" : g.startsAt && g.startsAt > now ? "UPCOMING" : "ACTIVE";
  return { id: g.id, recipientUserId: g.userId, recipientDisplayName: g.user.displayName, scopes, state, startsAt: g.startsAt?.toISOString() ?? null, expiresAt: g.expiresAt?.toISOString() ?? null, revokedAt: g.revokedAt?.toISOString() ?? null };
}
