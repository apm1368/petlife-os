import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { HouseholdRole, PetAccessSource, type Prisma } from "@prisma/client";
import type { PetAccessFlags } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { HouseholdAccessDeniedException, NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { DomainEventsService } from "../../common/events/domain-events.service";
import type { CreateHouseholdDto } from "./dto/create-household.dto";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import type { UpdateHouseholdDto } from "./dto/update-household.dto";

type InitialAccess = Array<{ petId: string; preset: "VIEW_ONLY" | "CARE_HELPER" | "FULL" }>;

const PRESETS: Record<InitialAccess[number]["preset"], PetAccessFlags> = {
  VIEW_ONLY: { canViewIdentity: true, canEditIdentity: false, canViewHealth: false, canEditHealth: false, canBookCare: false, canViewCareProfile: true, canEditCareProfile: false, canViewLocation: false, canManageAccess: false, canRecordClinicalData: false },
  CARE_HELPER: { canViewIdentity: true, canEditIdentity: false, canViewHealth: true, canEditHealth: false, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canViewLocation: true, canManageAccess: false, canRecordClinicalData: false },
  FULL: { canViewIdentity: true, canEditIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canViewLocation: true, canManageAccess: false, canRecordClinicalData: false },
};

function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
function normalizeContact(contact: string) { return contact.trim().toLowerCase().replace(/[\s()-]/g, ""); }
function maskContact(contact: string) {
  const [name, domain] = contact.split("@");
  if (domain) return `${(name ?? "").slice(0, 2)}***@${domain}`;
  return `${contact.slice(0, 4)}***${contact.slice(-2)}`;
}

@Injectable()
export class HouseholdsService {
  constructor(private readonly prisma: PrismaService, private readonly events: DomainEventsService, private readonly notifications: NotificationOrchestratorService) {}

  async create(userId: string, dto: CreateHouseholdDto) {
    return this.prisma.$transaction(async (tx) => {
      const household = await tx.household.create({ data: { ...dto, members: { create: { userId, role: HouseholdRole.OWNER } } } });
      await this.events.publish("HouseholdCreated", { householdId: household.id, ownerId: userId }, { tx, aggregateType: "Household", aggregateId: household.id });
      return household;
    });
  }

  async getById(id: string) {
    const household = await this.prisma.household.findUnique({ where: { id } });
    if (!household) throw new NotFoundApiException("Household");
    return household;
  }

  async update(id: string, userId: string, dto: UpdateHouseholdDto) {
    await this.requireOwner(id, userId);
    return this.prisma.household.update({ where: { id }, data: dto });
  }

  async listForUser(userId: string) {
    return this.prisma.household.findMany({ where: { members: { some: { userId } } }, orderBy: { createdAt: "asc" } });
  }

  async getCollaboration(householdId: string, userId: string) {
    await this.expireInvitations(householdId);
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: {
        members: { include: { user: { select: { id: true, displayName: true, avatarUrl: true, email: true, phone: true } } }, orderBy: { createdAt: "asc" } },
        pets: { where: { deletedAt: null }, select: { id: true, name: true, photoUrl: true, species: true, lifecycleStatus: true } },
        invitations: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!household) throw new NotFoundApiException("Household");
    const grants = await this.prisma.petAccessGrant.findMany({
      where: { pet: { householdId }, revokedAt: null },
      select: { id: true, petId: true, userId: true, source: true, startsAt: true, expiresAt: true, createdAt: true, canViewIdentity: true, canEditIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canViewLocation: true, canManageAccess: true, canRecordClinicalData: true },
    });
    const petIds = household.pets.map((pet) => pet.id);
    const [events, expiredTemporaryGrants] = await Promise.all([
      this.prisma.domainEvent.findMany({
        where: {
          OR: [
            { aggregateType: "Household", aggregateId: householdId },
            ...(petIds.length ? [{ aggregateType: "Pet", aggregateId: { in: petIds } }] : []),
          ],
          type: { in: ["HouseholdInvitationCreated", "HouseholdInvitationResent", "HouseholdInvitationCancelled", "HouseholdInvitationAccepted", "HouseholdInvitationDeclined", "PetAccessGranted", "PetAccessChanged", "PetAccessRevoked"] },
        },
        select: { id: true, type: true, occurredAt: true },
        orderBy: { occurredAt: "desc" },
        take: 24,
      }),
      this.prisma.petAccessGrant.findMany({
        where: { pet: { householdId }, source: PetAccessSource.TEMPORARY, expiresAt: { lte: new Date() } },
        select: { id: true, expiresAt: true },
        orderBy: { expiresAt: "desc" },
        take: 12,
      }),
    ]);
    const history = [
      ...events.map((event) => ({ id: event.id, type: event.type, occurredAt: event.occurredAt })),
      ...expiredTemporaryGrants.map((grant) => ({ id: `expired-${grant.id}`, type: "TemporaryPetAccessExpired", occurredAt: grant.expiresAt! })),
    ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 24);
    const membership = household.members.find((member) => member.userId === userId);
    return {
      ...household,
      currentUserRole: membership?.role,
      invitations: household.invitations.map((invitation) => ({ id: invitation.id, contactMasked: maskContact(invitation.contact), status: invitation.status, expiresAt: invitation.expiresAt, createdAt: invitation.createdAt, initialAccess: invitation.initialAccess })),
      grants,
      history,
    };
  }

  async invite(householdId: string, actorUserId: string, dto: { contact: string; initialAccess: InitialAccess }) {
    await this.requireOwner(householdId, actorUserId);
    const pets = await this.prisma.pet.count({ where: { householdId, id: { in: dto.initialAccess.map((item) => item.petId) } } });
    if (pets !== new Set(dto.initialAccess.map((item) => item.petId)).size) throw new HouseholdAccessDeniedException();
    const contact = normalizeContact(dto.contact);
    const rawToken = randomBytes(32).toString("base64url");
    const invitation = await this.prisma.householdInvitation.create({
      data: { householdId, contact, tokenHash: tokenHash(rawToken), invitedByUserId: actorUserId, initialAccess: dto.initialAccess as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    const target = contact.includes("@")
      ? await this.prisma.user.findUnique({ where: { email: contact }, select: { id: true, locale: true } })
      : await this.prisma.user.findUnique({ where: { phone: contact }, select: { id: true, locale: true } });
    if (target) {
      const inviter = await this.prisma.user.findUniqueOrThrow({ where: { id: actorUserId }, select: { displayName: true } });
      await this.notifications.notify({
        userId: target.id,
        type: "household.invited",
        category: "HOUSEHOLD",
        templateParams: { inviterName: inviter.displayName },
        deepLink: `/${target.locale}/invitations/${rawToken}`,
        entityType: "HouseholdInvitation",
        entityId: invitation.id,
      });
    }
    await this.events.publish("HouseholdInvitationCreated", { householdId, invitationId: invitation.id, actorUserId }, { aggregateType: "Household", aggregateId: householdId });
    return { id: invitation.id, status: invitation.status, contactMasked: maskContact(contact), expiresAt: invitation.expiresAt, delivery: target ? "DELIVERED" : "BLOCKED_EXTERNAL" };
  }

  async resendInvitation(householdId: string, invitationId: string, actorUserId: string) {
    await this.requireOwner(householdId, actorUserId);
    const invitation = await this.prisma.householdInvitation.findFirst({ where: { id: invitationId, householdId, status: "PENDING" } });
    if (!invitation) throw new NotFoundApiException("Invitation");
    const rawToken = randomBytes(32).toString("base64url");
    const updated = await this.prisma.householdInvitation.update({ where: { id: invitationId }, data: { tokenHash: tokenHash(rawToken), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });
    const target = updated.contact.includes("@")
      ? await this.prisma.user.findUnique({ where: { email: updated.contact }, select: { id: true, locale: true } })
      : await this.prisma.user.findUnique({ where: { phone: updated.contact }, select: { id: true, locale: true } });
    if (target) {
      const inviter = await this.prisma.user.findUniqueOrThrow({ where: { id: actorUserId }, select: { displayName: true } });
      await this.notifications.notify({
        userId: target.id,
        type: "household.invited",
        category: "HOUSEHOLD",
        templateParams: { inviterName: inviter.displayName },
        deepLink: `/${target.locale}/invitations/${rawToken}`,
        entityType: "HouseholdInvitation",
        entityId: invitation.id,
      });
    }
    await this.events.publish("HouseholdInvitationResent", { householdId, invitationId, actorUserId }, { aggregateType: "Household", aggregateId: householdId });
    return { id: updated.id, status: updated.status, contactMasked: maskContact(updated.contact), expiresAt: updated.expiresAt, delivery: target ? "DELIVERED" : "BLOCKED_EXTERNAL" };
  }

  async cancelInvitation(householdId: string, invitationId: string, actorUserId: string) {
    await this.requireOwner(householdId, actorUserId);
    const result = await this.prisma.householdInvitation.updateMany({ where: { id: invitationId, householdId, status: "PENDING" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    if (!result.count) throw new NotFoundApiException("Invitation");
    await this.events.publish("HouseholdInvitationCancelled", { householdId, invitationId, actorUserId }, { aggregateType: "Household", aggregateId: householdId });
    return { ok: true };
  }

  async inspectInvitation(token: string, userId: string) {
    const invitation = await this.findActiveInvitation(token);
    await this.requireInvitee(invitation.contact, userId);
    const household = await this.prisma.household.findUniqueOrThrow({ where: { id: invitation.householdId }, select: { id: true, name: true } });
    const inviter = await this.prisma.user.findUnique({ where: { id: invitation.invitedByUserId }, select: { displayName: true } });
    return { household, inviter, expiresAt: invitation.expiresAt, initialAccess: invitation.initialAccess };
  }

  async acceptInvitation(token: string, userId: string) {
    const invitation = await this.findActiveInvitation(token);
    await this.requireInvitee(invitation.contact, userId);
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.householdInvitation.updateMany({ where: { id: invitation.id, status: "PENDING" }, data: { status: "ACCEPTED", acceptedByUserId: userId, acceptedAt: new Date() } });
      if (!claimed.count) throw new ValidationApiException({ field: "token", reason: "Invitation is no longer available." });
      await tx.householdMember.upsert({ where: { householdId_userId: { householdId: invitation.householdId, userId } }, create: { householdId: invitation.householdId, userId, role: "FAMILY" }, update: {} });
      const access = invitation.initialAccess as unknown as InitialAccess;
      for (const item of access) {
        await tx.petAccessGrant.create({ data: { petId: item.petId, userId, source: PetAccessSource.HOUSEHOLD, grantedByUserId: invitation.invitedByUserId, ...PRESETS[item.preset] } });
      }
      await this.events.publish("HouseholdInvitationAccepted", { householdId: invitation.householdId, invitationId: invitation.id, userId }, { tx, aggregateType: "Household", aggregateId: invitation.householdId });
      return { householdId: invitation.householdId };
    });
  }

  async declineInvitation(token: string, userId: string) {
    const invitation = await this.findActiveInvitation(token);
    await this.requireInvitee(invitation.contact, userId);
    await this.prisma.householdInvitation.update({ where: { id: invitation.id }, data: { status: "DECLINED", declinedAt: new Date() } });
    await this.events.publish("HouseholdInvitationDeclined", { householdId: invitation.householdId, invitationId: invitation.id, userId }, { aggregateType: "Household", aggregateId: invitation.householdId });
    return { ok: true };
  }

  private async requireOwner(householdId: string, userId: string) {
    const member = await this.prisma.householdMember.findUnique({ where: { householdId_userId: { householdId, userId } } });
    if (member?.role !== HouseholdRole.OWNER) throw new HouseholdAccessDeniedException({ householdId });
  }

  private async requireInvitee(contact: string, userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, phone: true } });
    const contacts = [user.email, user.phone].filter(Boolean).map((value) => normalizeContact(value!));
    if (!contacts.includes(contact)) throw new HouseholdAccessDeniedException();
  }

  private async findActiveInvitation(token: string) {
    const invitation = await this.prisma.householdInvitation.findUnique({ where: { tokenHash: tokenHash(token) } });
    if (!invitation || invitation.status !== "PENDING") throw new NotFoundApiException("Invitation");
    if (invitation.expiresAt <= new Date()) {
      await this.prisma.householdInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
      throw new ValidationApiException({ field: "token", reason: "Invitation has expired." });
    }
    return invitation;
  }

  private async expireInvitations(householdId: string) {
    await this.prisma.householdInvitation.updateMany({ where: { householdId, status: "PENDING", expiresAt: { lte: new Date() } }, data: { status: "EXPIRED" } });
  }
}
