import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { AllergyStatus, ConditionStatus, LostPetIncidentStatus, MedicationStatus, PetAccessSource, PetShareCardKind, Prisma } from "@prisma/client";
import type { PetAccessFlags } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { HouseholdAccessDeniedException, NotFoundApiException, PetAccessDeniedException, ValidationApiException } from "../../common/errors/api-exception";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import { DEFAULT_CARD_FIELDS, type CareHandoffScope, type CreateCareHandoffDto, type CreateShareCardDto, type PetCardContactMessageDto, type PetCardField, type UpsertEmergencyInfoDto } from "./pet-safety.dto";

const HANDOFF_REASON = "CARE_HANDOFF";
const EMERGENCY_SCOPE = "EMERGENCY_SNAPSHOT";
const MAX_HANDOFF_MS = 30 * 86400e3;
const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");
/** Order in which missing profile fields are recommended: what helps most if the pet is lost or ill comes first. */
const RECOMMENDATION_ORDER = ["microchip", "emergencyContact", "photo", "vaccinationHistory", "weight", "birthDate", "breed", "sex", "medicalDocument", "species"];
const OPEN_LOST: LostPetIncidentStatus[] = [LostPetIncidentStatus.OPEN, LostPetIncidentStatus.SEARCHING, LostPetIncidentStatus.SIGHTING_REPORTED];

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
    const score = Math.round((completedFields.length / checks.length) * 100);
    const recommendedNextFields = RECOMMENDATION_ORDER.filter((f) => missingFields.includes(f)).slice(0, 3);
    return { petId, score, completionScore: score, completedFields, missingFields, recommendedNextFields };
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

  /**
   * Creates the card (revoking any active one of the same kind) and returns the raw token exactly once. Only the
   * owner-selected fields are public; a phone appears only with contactMode PHONE/BOTH and explicit phoneConsent.
   */
  async createCard(petId: string, userId: string, dto: CreateShareCardDto, replacing?: string) {
    const kind = dto.kind as PetShareCardKind;
    if (kind === PetShareCardKind.EMERGENCY && dto.expiresInHours === undefined) dto.expiresInHours = 72;
    const contactMode = dto.contactMode ?? "IN_APP";
    if (contactMode !== "IN_APP") {
      if (dto.phoneConsent !== true) throw new ValidationApiException({ field: "phoneConsent", reason: "PHONE_CONSENT_REQUIRED" });
      const info = await this.prisma.petEmergencyInfo.findUnique({ where: { petId }, select: { contactPhone: true } });
      if (!info?.contactPhone) throw new ValidationApiException({ field: "contactMode", reason: "EMERGENCY_PHONE_MISSING" });
    }
    const fields = dto.fields ?? DEFAULT_CARD_FIELDS[dto.kind];
    const expiresAt = dto.expiresInHours ? new Date(Date.now() + dto.expiresInHours * 3600e3) : null;
    const raw = randomBytes(24).toString("base64url");
    const card = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.petShareCard.updateMany({ where: { petId, kind, revokedAt: null }, data: { revokedAt: now } });
      const row = await tx.petShareCard.create({ data: { petId, kind, tokenHash: hashToken(raw), tokenHint: raw.slice(-4), includeContact: contactMode !== "IN_APP", visibleFields: fields, contactMode, phoneConsentAt: contactMode !== "IN_APP" ? now : null, expiresAt, createdByUserId: userId } });
      if (replacing) await tx.petShareCard.update({ where: { id: replacing }, data: { replacedByCardId: row.id } });
      await this.events.publish(replacing ? "PetShareCardRotated" : "PetShareCardCreated", { petId, cardId: row.id, kind, actorUserId: userId, expiresAt, replacedCardId: replacing ?? null }, { aggregateType: "Pet", aggregateId: petId, tx });
      return row;
    });
    return { ...toCardDto(card, new Date()), token: raw, publicPath: `/pet-card/${raw}` };
  }

  /** New token, same settings; the old link stops working immediately and reads as ROTATED. */
  async rotateCard(petId: string, cardId: string, userId: string) {
    const card = await this.prisma.petShareCard.findFirst({ where: { id: cardId, petId, revokedAt: null } });
    if (!card) throw new NotFoundApiException("PetShareCard");
    const hours = card.expiresAt ? Math.max(1, Math.round((card.expiresAt.getTime() - Date.now()) / 3600e3)) : undefined;
    return this.createCard(petId, userId, { kind: card.kind, fields: card.visibleFields as PetCardField[], contactMode: card.contactMode, phoneConsent: card.phoneConsentAt !== null, expiresInHours: hours ? Math.min(hours, 720) : undefined }, card.id);
  }

  async revokeCard(petId: string, cardId: string, userId: string) {
    const done = await this.prisma.petShareCard.updateMany({ where: { id: cardId, petId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!done.count) throw new NotFoundApiException("PetShareCard");
    await this.events.publish("PetShareCardRevoked", { petId, cardId, actorUserId: userId }, { aggregateType: "Pet", aggregateId: petId });
    return { revoked: true };
  }

  private async activeCardByToken(rawToken: string) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(rawToken)) throw new NotFoundApiException("PetCard");
    const card = await this.prisma.petShareCard.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!card || card.revokedAt || (card.expiresAt && card.expiresAt <= new Date())) throw new NotFoundApiException("PetCard");
    return card;
  }

  /**
   * Public read by token. Unknown, revoked, rotated and expired tokens all look the same (404). Shows the pet's name
   * plus only the owner-selected fields; never the household, address, documents, bookings or the microchip number.
   */
  async readPublicCard(rawToken: string) {
    const card = await this.activeCardByToken(rawToken);
    await this.prisma.petShareCard.update({ where: { id: card.id }, data: { lastAccessedAt: new Date(), accessCount: { increment: 1 } } });
    const show = new Set(card.visibleFields);
    const pet = await this.prisma.pet.findUniqueOrThrow({
      where: { id: card.petId },
      include: {
        emergencyInfo: true,
        allergies: { where: { status: AllergyStatus.ACTIVE }, select: { name: true, reaction: true, severity: true }, orderBy: { name: "asc" } },
        conditions: { where: { status: ConditionStatus.ACTIVE }, select: { name: true }, orderBy: { name: "asc" } },
        medications: { where: { status: MedicationStatus.ACTIVE }, select: { name: true, dosage: true, unit: true, frequencyText: true }, orderBy: { name: "asc" } },
      },
    });
    const lost = await this.prisma.lostPetIncident.findFirst({ where: { petId: card.petId, status: { in: OPEN_LOST } }, select: { id: true } });
    const phoneShown = card.contactMode !== "IN_APP" && card.phoneConsentAt !== null;
    const pick = <T>(field: PetCardField, value: T) => (show.has(field) ? value : undefined);
    return {
      kind: card.kind,
      expiresAt: card.expiresAt?.toISOString() ?? null,
      name: pet.name,
      photoUrl: pick("PHOTO", pet.photoUrl),
      species: pick("SPECIES", pet.species),
      breed: pick("BREED", pet.breed),
      sex: pick("SEX", pet.sex),
      birthDate: pick("AGE", pet.birthDate?.toISOString().slice(0, 10) ?? null),
      approximateAgeMonths: pick("AGE", pet.approximateAgeMonths),
      hasMicrochip: pick("MICROCHIP_STATUS", Boolean(pet.microchipNumber)),
      allergies: pick("ALLERGIES", pet.allergies.map((a) => ({ name: a.name, reaction: a.reaction, severity: a.severity }))),
      activeConditions: pick("CONDITIONS", pet.conditions.map((c) => c.name)),
      activeMedications: pick("MEDICATIONS", pet.medications.map((m) => ({ name: m.name, dosage: m.dosage?.toString() ?? null, unit: m.unit, frequency: m.frequencyText }))),
      bloodType: pick("BLOOD_TYPE", pet.emergencyInfo?.bloodType ?? null),
      criticalNotes: pick("CRITICAL_NOTES", pet.emergencyInfo?.criticalNotes ?? null),
      visibleFields: card.visibleFields,
      contact: { mode: card.contactMode, canMessageOwner: card.contactMode !== "PHONE", emergencyContact: phoneShown ? contactOf(pet.emergencyInfo) : null },
      /** Kept for existing clients: the same as contact.emergencyContact. The microchip number itself is never public. */
      emergencyContact: phoneShown ? contactOf(pet.emergencyInfo) : null,
      microchipNumber: null,
      isReportedLost: Boolean(lost),
      lostIncidentId: lost?.id ?? null,
    };
  }

  /** A finder's message to the owner through the card (IN_APP/BOTH). The finder learns nothing about the owner. */
  async postContactMessage(rawToken: string, dto: PetCardContactMessageDto, senderUserId?: string) {
    const card = await this.activeCardByToken(rawToken);
    if (card.contactMode === "PHONE") throw new ValidationApiException({ field: "contactMode", reason: "IN_APP_CONTACT_DISABLED" });
    const message = dto.message.trim();
    if (message.length < 5) throw new ValidationApiException({ field: "message" });
    const row = await this.prisma.petCardContactMessage.create({ data: { cardId: card.id, petId: card.petId, message, finderContact: dto.finderContact?.trim() || null, senderUserId: senderUserId ?? null } });
    const pet = await this.prisma.pet.findUniqueOrThrow({ where: { id: card.petId }, select: { name: true, householdId: true } });
    await this.events.publish("PetCardContactReceived", { petId: card.petId, cardId: card.id, messageId: row.id }, { aggregateType: "Pet", aggregateId: card.petId });
    const owners = await this.prisma.householdMember.findMany({ where: { householdId: pet.householdId, role: "OWNER" }, select: { userId: true } });
    for (const o of owners) {
      await this.notifications.notify({ userId: o.userId, type: "pet.card_contact_message", category: "LOST_PET", deepLink: NotificationDeepLinks.pet(card.petId), entityType: "PetCardContactMessage", entityId: row.id, templateParams: { petName: pet.name } });
    }
    return { received: true };
  }

  async listContactMessages(petId: string) {
    const rows = await this.prisma.petCardContactMessage.findMany({ where: { petId }, orderBy: { createdAt: "desc" }, take: 100, include: { card: { select: { kind: true } } } });
    return rows.map((m) => ({ id: m.id, cardKind: m.card.kind, message: m.message, finderContact: m.finderContact, createdAt: m.createdAt.toISOString(), readAt: m.readAt?.toISOString() ?? null }));
  }

  async markContactMessageRead(petId: string, messageId: string) {
    const done = await this.prisma.petCardContactMessage.updateMany({ where: { id: messageId, petId, readAt: null }, data: { readAt: new Date() } });
    if (!done.count && !(await this.prisma.petCardContactMessage.count({ where: { id: messageId, petId } }))) throw new NotFoundApiException("PetCardContactMessage");
    return { read: true };
  }

  /** The active ID-tag card for this pet, if any (used by lost-pet incidents to reference the identity card). */
  async activeIdTagCardId(petId: string) {
    const card = await this.prisma.petShareCard.findFirst({ where: { petId, kind: PetShareCardKind.ID_TAG, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { id: true } });
    return card?.id ?? null;
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
  const state = c.replacedByCardId ? "ROTATED" : c.revokedAt ? "REVOKED" : c.expiresAt && c.expiresAt <= now ? "EXPIRED" : "ACTIVE";
  return { id: c.id, kind: c.kind, state, tokenHint: c.tokenHint, visibleFields: c.visibleFields, contactMode: c.contactMode, phoneConsentAt: c.phoneConsentAt?.toISOString() ?? null, replacedByCardId: c.replacedByCardId, includeContact: c.includeContact, expiresAt: c.expiresAt?.toISOString() ?? null, revokedAt: c.revokedAt?.toISOString() ?? null, lastAccessedAt: c.lastAccessedAt?.toISOString() ?? null, accessCount: c.accessCount, createdAt: c.createdAt.toISOString() };
}
function toHandoffDto(g: Prisma.PetAccessGrantGetPayload<{ include: { user: { select: { displayName: true } } } }>, now: Date) {
  const scopes = ["BASIC_PROFILE", ...(g.canEditCareProfile ? ["CARE"] : []), ...(g.canBookCare ? ["BOOKINGS"] : []), ...(g.healthScopes.includes(EMERGENCY_SCOPE) ? ["EMERGENCY_HEALTH"] : [])];
  const state = g.revokedAt ? "REVOKED" : g.expiresAt && g.expiresAt <= now ? "EXPIRED" : g.startsAt && g.startsAt > now ? "UPCOMING" : "ACTIVE";
  return { id: g.id, recipientUserId: g.userId, recipientDisplayName: g.user.displayName, scopes, state, startsAt: g.startsAt?.toISOString() ?? null, expiresAt: g.expiresAt?.toISOString() ?? null, revokedAt: g.revokedAt?.toISOString() ?? null };
}
