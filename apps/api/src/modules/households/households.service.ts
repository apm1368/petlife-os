import { classifyIdentifier } from "../auth/identifier.util";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { HouseholdRole, PetAccessSource, type Prisma } from "@prisma/client";
import type { PetAccessFlags } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AlreadyHouseholdMemberException, HouseholdInvitationAlreadyPendingException, InvitationAlreadyUsedException, InvitationExpiredException, InvitationNotForYouException, InvitationRevokedException, HouseholdAccessDeniedException, LastHouseholdOwnerException, NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
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
/** Emails are compared case-insensitively as typed (hyphens are legal in addresses); phones in canonical E.164, the form users.phone stores. */
function normalizeContact(contact: string) {
  return classifyIdentifier(contact).value;
}
/** For contacts already stored (an account's own email/phone): never throws on a legacy value, it just won't match. */
function normalizeStoredContact(contact: string) {
  try {
    return normalizeContact(contact);
  } catch {
    return contact.trim().toLowerCase();
  }
}
function maskContact(contact: string) {
  const [name, domain] = contact.split("@");
  if (domain) return `${(name ?? "").slice(0, 2)}***@${domain}`;
  return `${contact.slice(0, 4)}***${contact.slice(-2)}`;
}

@Injectable()
export class HouseholdsService {
  constructor(private readonly prisma: PrismaService, private readonly events: DomainEventsService, private readonly notifications: NotificationOrchestratorService) {}

  async create(userId: string, dto: CreateHouseholdDto) {
    const household = await this.prisma.$transaction(async (tx) => {
      const created = await tx.household.create({ data: { ...dto, members: { create: { userId, role: HouseholdRole.OWNER } } } });
      await this.events.publish("HouseholdCreated", { householdId: created.id, ownerId: userId }, { tx, aggregateType: "Household", aggregateId: created.id });
      return created;
    });
    // The welcome trial starts with the household's first pet (PetsService.create), not here.
    return household;
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

  /** Only verified contacts see inbox summaries; unverified phone matches must open the owner's secret link. */
  async listIncomingInvitations(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, phone: true, emailVerifiedAt: true, phoneVerifiedAt: true } });
    const contacts = [...new Set([
      user.emailVerifiedAt ? normalizeStoredContact(user.email!) : null,
      user.phoneVerifiedAt ? normalizeStoredContact(user.phone!) : null,
    ].filter((value): value is string => Boolean(value)))];
    if (!contacts.length) return [];
    const invitations = await this.prisma.householdInvitation.findMany({
      where: { contact: { in: contacts }, status: "PENDING", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    const inviters = await this.prisma.user.findMany({ where: { id: { in: [...new Set(invitations.map((invitation) => invitation.invitedByUserId))] } }, select: { id: true, displayName: true } });
    const inviterNames = new Map(inviters.map((inviter) => [inviter.id, inviter.displayName]));
    return invitations.map((invitation) => {
      return {
        id: invitation.id,
        inviter: { displayName: inviterNames.get(invitation.invitedByUserId) ?? "" },
        contactMasked: maskContact(invitation.contact),
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      };
    });
  }

  async getCollaboration(householdId: string, userId: string) {
    await this.expireInvitations(householdId);
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: {
        // Members see each other by name only — contact details stay with their owner.
        members: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } }, orderBy: { createdAt: "asc" } },
        pets: { where: { deletedAt: null }, select: { id: true, name: true, photoUrl: true, species: true, lifecycleStatus: true } },
        invitations: {
          where: { status: { in: ["PENDING", "REQUESTED"] } },
          include: { requestedBy: { select: { id: true, displayName: true, avatarUrl: true, phone: true, phoneVerifiedAt: true } } },
          orderBy: { createdAt: "desc" },
        },
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
          type: { in: ["HouseholdInvitationCreated", "HouseholdInvitationResent", "HouseholdInvitationCancelled", "HouseholdInvitationAccepted", "HouseholdInvitationDeclined", "HouseholdMembershipRequested", "HouseholdMembershipApproved", "HouseholdMembershipRejected", "PetAccessGranted", "PetAccessChanged", "PetAccessRevoked", "HouseholdMemberRemoved", "HouseholdMemberLeft", "HouseholdMemberRoleChanged"] },
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
    const isOwner = membership?.role === HouseholdRole.OWNER;
    const now = new Date();
    const visiblePetIds = new Set(grants
      .filter((grant) => grant.userId === userId && grant.canViewIdentity && (!grant.startsAt || grant.startsAt <= now) && (!grant.expiresAt || grant.expiresAt > now))
      .map((grant) => grant.petId));
    return {
      ...household,
      // Membership does not imply access to every pet in a household. Owners can manage all;
      // other members see only identities granted to them and only their own grant details.
      pets: isOwner ? household.pets : household.pets.filter((pet) => visiblePetIds.has(pet.id)),
      currentUserRole: membership?.role,
      // Requests and their identifying information are owner-only. A regular member must not
      // learn who was invited or who is asking to join this household.
      invitations: membership?.role === HouseholdRole.OWNER
        ? household.invitations.map((invitation) => ({
          id: invitation.id,
          contactMasked: maskContact(invitation.contact),
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
          requestedAt: invitation.requestedAt,
          initialAccess: invitation.initialAccess,
          requester: invitation.requestedBy ? {
            id: invitation.requestedBy.id,
            displayName: invitation.requestedBy.displayName,
            avatarUrl: invitation.requestedBy.avatarUrl,
            phoneMasked: invitation.requestedBy.phone ? maskContact(normalizeStoredContact(invitation.requestedBy.phone)) : null,
            phoneVerified: Boolean(invitation.requestedBy.phoneVerifiedAt),
          } : null,
        }))
        : [],
      grants: isOwner ? grants : grants.filter((grant) => grant.userId === userId && visiblePetIds.has(grant.petId)),
      history,
    };
  }

  async invite(householdId: string, actorUserId: string, dto: { contact: string; initialAccess: InitialAccess }) {
    await this.requireOwner(householdId, actorUserId);
    const pets = await this.prisma.pet.count({ where: { householdId, id: { in: dto.initialAccess.map((item) => item.petId) } } });
    if (pets !== new Set(dto.initialAccess.map((item) => item.petId)).size) throw new HouseholdAccessDeniedException();
    const contact = normalizeContact(dto.contact);
    const rawToken = randomBytes(32).toString("base64url");
    const invitation = await this.prisma.$transaction(async (tx) => {
      // Serializes concurrent invitations for the same household/contact without imposing a
      // single-household constraint on the user.
      await tx.$queryRaw<Array<{ locked: boolean }>>`WITH acquired AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext(${householdId}), hashtext(${contact}))) SELECT TRUE AS locked FROM acquired`;
      const now = new Date();
      await tx.householdInvitation.updateMany({ where: { householdId, contact, status: "PENDING", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
      const currentMembers = await tx.householdMember.findMany({ where: { householdId }, select: { user: { select: { email: true, phone: true } } } });
      const alreadyMember = currentMembers.some(({ user }) => [user.phone, user.email].filter(Boolean).some((value) => normalizeStoredContact(value!) === contact));
      if (alreadyMember) throw new AlreadyHouseholdMemberException();
      const pending = await tx.householdInvitation.findFirst({ where: { householdId, contact, status: { in: ["PENDING", "REQUESTED"] } }, select: { id: true } });
      if (pending) throw new HouseholdInvitationAlreadyPendingException();
      return tx.householdInvitation.create({
        data: { householdId, contact, tokenHash: tokenHash(rawToken), invitedByUserId: actorUserId, initialAccess: dto.initialAccess as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      });
    });
    // This is an in-app notice only, not proof of phone ownership or an SMS/email delivery.
    const target = contact.includes("@")
      ? await this.prisma.user.findFirst({ where: { email: contact, emailVerifiedAt: { not: null } }, select: { id: true, locale: true } })
      : await this.prisma.user.findFirst({ where: { phone: contact }, select: { id: true, locale: true } });
    if (target) {
      const inviter = await this.prisma.user.findUniqueOrThrow({ where: { id: actorUserId }, select: { displayName: true } });
      await this.notifications.notify({
        userId: target.id,
        type: "household.invited",
        category: "HOUSEHOLD",
        templateParams: { inviterName: inviter.displayName },
        deepLink: NotificationDeepLinks.householdInvitation(rawToken),
        entityType: "HouseholdInvitation",
        entityId: invitation.id,
      });
    }
    await this.events.publish("HouseholdInvitationCreated", { householdId, invitationId: invitation.id, actorUserId }, { aggregateType: "Household", aggregateId: householdId });
    return { id: invitation.id, status: invitation.status, contactMasked: maskContact(contact), expiresAt: invitation.expiresAt, delivery: target ? "IN_APP" : "LINK_ONLY", sharePath: NotificationDeepLinks.householdInvitation(rawToken) };
  }

  async resendInvitation(householdId: string, invitationId: string, actorUserId: string) {
    await this.requireOwner(householdId, actorUserId);
    const invitation = await this.prisma.householdInvitation.findFirst({ where: { id: invitationId, householdId, status: "PENDING" } });
    if (!invitation) throw new NotFoundApiException("Invitation");
    const rawToken = randomBytes(32).toString("base64url");
    const updated = await this.prisma.householdInvitation.update({ where: { id: invitationId }, data: { tokenHash: tokenHash(rawToken), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });
    const target = updated.contact.includes("@")
      ? await this.prisma.user.findFirst({ where: { email: updated.contact, emailVerifiedAt: { not: null } }, select: { id: true, locale: true } })
      : await this.prisma.user.findFirst({ where: { phone: updated.contact }, select: { id: true, locale: true } });
    if (target) {
      const inviter = await this.prisma.user.findUniqueOrThrow({ where: { id: actorUserId }, select: { displayName: true } });
      await this.notifications.notify({
        userId: target.id,
        type: "household.invited",
        category: "HOUSEHOLD",
        templateParams: { inviterName: inviter.displayName },
        deepLink: NotificationDeepLinks.householdInvitation(rawToken),
        entityType: "HouseholdInvitation",
        entityId: invitation.id,
      });
    }
    await this.events.publish("HouseholdInvitationResent", { householdId, invitationId, actorUserId }, { aggregateType: "Household", aggregateId: householdId });
    return { id: updated.id, status: updated.status, contactMasked: maskContact(updated.contact), expiresAt: updated.expiresAt, delivery: target ? "IN_APP" : "LINK_ONLY", sharePath: NotificationDeepLinks.householdInvitation(rawToken) };
  }

  async cancelInvitation(householdId: string, invitationId: string, actorUserId: string) {
    await this.requireOwner(householdId, actorUserId);
    const result = await this.prisma.householdInvitation.updateMany({ where: { id: invitationId, householdId, status: { in: ["PENDING", "REQUESTED"] } }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    if (!result.count) throw new NotFoundApiException("Invitation");
    await this.events.publish("HouseholdInvitationCancelled", { householdId, invitationId, actorUserId }, { aggregateType: "Household", aggregateId: householdId });
    return { ok: true };
  }

  async inspectInvitation(token: string, userId: string) {
    const invitation = await this.prisma.householdInvitation.findUnique({ where: { tokenHash: tokenHash(token) } });
    if (!invitation) throw new NotFoundApiException("Invitation");
    await this.requireInvitee(invitation.contact, userId);
    if (invitation.status === "REQUESTED" && invitation.requestedByUserId === userId) {
      return { contactMasked: maskContact(invitation.contact), phoneVerified: await this.isPhoneVerified(userId), expiresAt: invitation.expiresAt, requestPending: true };
    }
    if (invitation.status === "REQUESTED") throw new InvitationAlreadyUsedException();
    const active = await this.findActiveInvitation(token);
    return { contactMasked: maskContact(active.contact), phoneVerified: await this.isPhoneVerified(userId), expiresAt: active.expiresAt, requestPending: false };
  }

  async requestMembership(token: string, userId: string) {
    const invitation = await this.prisma.householdInvitation.findUnique({ where: { tokenHash: tokenHash(token) } });
    if (!invitation) throw new NotFoundApiException("Invitation");
    await this.requireInvitee(invitation.contact, userId);
    if (invitation.status === "REQUESTED" && invitation.requestedByUserId === userId) {
      return { householdId: invitation.householdId, invitationId: invitation.id, status: "REQUESTED", alreadyRequested: true };
    }
    if (invitation.status === "REQUESTED") throw new InvitationAlreadyUsedException();
    // Do not perform another "active invitation" read here. A concurrent
    // request can claim the invitation between the initial read and that
    // second read, which would turn a valid idempotent retry into a 409
    // before the compare-and-set fallback below can return REQUESTED.
    return this.createMembershipRequest(invitation, userId);
  }

  async requestIncomingMembership(invitationId: string, userId: string) {
    const invitation = await this.prisma.householdInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation) throw new NotFoundApiException("Invitation");
    await this.requireInvitee(invitation.contact, userId);
    if (invitation.status === "REQUESTED" && invitation.requestedByUserId === userId) {
      return { householdId: invitation.householdId, invitationId: invitation.id, status: "REQUESTED", alreadyRequested: true };
    }
    if (invitation.status === "REQUESTED") throw new InvitationAlreadyUsedException();
    return this.createMembershipRequest(invitation, userId);
  }

  private async createMembershipRequest(invitation: NonNullable<Awaited<ReturnType<HouseholdsService["findActiveInvitation"]>>>, userId: string) {
    await this.requireInvitee(invitation.contact, userId);
    const requestedAt = new Date();
    if (invitation.status === "CANCELLED") throw new InvitationRevokedException();
    if (invitation.status === "EXPIRED") throw new InvitationExpiredException();
    if (invitation.status !== "PENDING") throw new InvitationAlreadyUsedException();
    if (invitation.expiresAt <= requestedAt) {
      await this.prisma.householdInvitation.updateMany({
        where: { id: invitation.id, status: "PENDING", expiresAt: { lte: requestedAt } },
        data: { status: "EXPIRED" },
      });
      throw new InvitationExpiredException();
    }
    const claimed = await this.prisma.householdInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING", expiresAt: { gt: requestedAt } },
      data: { status: "REQUESTED", requestedByUserId: userId, requestedAt },
    });
    if (!claimed.count) {
      const current = await this.prisma.householdInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
      if (current.status === "REQUESTED" && current.requestedByUserId === userId) {
        return { householdId: current.householdId, invitationId: current.id, status: "REQUESTED", alreadyRequested: true };
      }
      if (current.status === "CANCELLED") throw new InvitationRevokedException();
      if (current.status === "EXPIRED" || current.expiresAt <= new Date()) throw new InvitationExpiredException();
      throw new InvitationAlreadyUsedException();
    }
    await this.events.publish("HouseholdMembershipRequested", { householdId: invitation.householdId, invitationId: invitation.id, userId }, { aggregateType: "Household", aggregateId: invitation.householdId });
    return { householdId: invitation.householdId, invitationId: invitation.id, status: "REQUESTED", alreadyRequested: false };
  }

  async approveMembershipRequest(householdId: string, invitationId: string, actorUserId: string) {
    await this.requireOwner(householdId, actorUserId);
    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.householdInvitation.findFirst({ where: { id: invitationId, householdId, status: "REQUESTED" } });
      if (!invitation?.requestedByUserId) {
        const existing = await tx.householdInvitation.findFirst({ where: { id: invitationId, householdId }, select: { status: true } });
        if (existing) throw new InvitationAlreadyUsedException();
        throw new NotFoundApiException("Membership request");
      }
      const userId = invitation.requestedByUserId;
      // The phone remains unverified. Matching permits a request only; owner approval grants access.
      const account = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true, phoneVerifiedAt: true, email: true, emailVerifiedAt: true } });
      const phoneMatches = Boolean(account.phone && normalizeStoredContact(account.phone) === invitation.contact);
      const emailMatches = Boolean(account.emailVerifiedAt && account.email && normalizeStoredContact(account.email) === invitation.contact);
      if (!phoneMatches && !emailMatches) throw new InvitationNotForYouException();
      const reviewedAt = new Date();
      const claimed = await tx.householdInvitation.updateMany({
        where: { id: invitation.id, householdId, status: "REQUESTED", requestedByUserId: userId },
        data: { status: "ACCEPTED", acceptedByUserId: userId, acceptedAt: reviewedAt, reviewedByUserId: actorUserId, reviewedAt },
      });
      if (!claimed.count) throw new InvitationAlreadyUsedException();
      const existingMember = await tx.householdMember.findUnique({ where: { householdId_userId: { householdId: invitation.householdId, userId } }, select: { id: true } });
      await tx.householdMember.upsert({ where: { householdId_userId: { householdId: invitation.householdId, userId } }, create: { householdId: invitation.householdId, userId, role: "FAMILY" }, update: {} });
      const access = invitation.initialAccess as unknown as InitialAccess;
      for (const item of access) {
        // A pet removed from the household since the invite was sent is skipped, and an existing household grant is not duplicated.
        const pet = await tx.pet.findFirst({ where: { id: item.petId, householdId: invitation.householdId, deletedAt: null }, select: { id: true } });
        if (!pet) continue;
        const existing = await tx.petAccessGrant.findFirst({ where: { petId: item.petId, userId, source: PetAccessSource.HOUSEHOLD, revokedAt: null }, select: { id: true } });
        if (existing) continue;
        await tx.petAccessGrant.create({ data: { petId: item.petId, userId, source: PetAccessSource.HOUSEHOLD, grantedByUserId: invitation.invitedByUserId, ...PRESETS[item.preset] } });
      }
      await this.events.publish("HouseholdMembershipApproved", { householdId: invitation.householdId, invitationId: invitation.id, userId, approvedByUserId: actorUserId }, { tx, aggregateType: "Household", aggregateId: invitation.householdId });
      await this.events.publish("HouseholdInvitationAccepted", { householdId: invitation.householdId, invitationId: invitation.id, userId, approvedByUserId: actorUserId }, { tx, aggregateType: "Household", aggregateId: invitation.householdId });
      return { householdId: invitation.householdId, userId, status: "ACCEPTED", alreadyMember: Boolean(existingMember) };
    });
  }

  async rejectMembershipRequest(householdId: string, invitationId: string, actorUserId: string) {
    await this.requireOwner(householdId, actorUserId);
    const reviewedAt = new Date();
    const invitation = await this.prisma.householdInvitation.findFirst({ where: { id: invitationId, householdId, status: "REQUESTED" }, select: { requestedByUserId: true } });
    if (!invitation?.requestedByUserId) throw new NotFoundApiException("Membership request");
    const result = await this.prisma.householdInvitation.updateMany({
      where: { id: invitationId, householdId, status: "REQUESTED", requestedByUserId: invitation.requestedByUserId },
      data: { status: "DECLINED", declinedAt: reviewedAt, reviewedByUserId: actorUserId, reviewedAt },
    });
    if (!result.count) throw new InvitationAlreadyUsedException();
    await this.events.publish("HouseholdMembershipRejected", { householdId, invitationId, userId: invitation.requestedByUserId, rejectedByUserId: actorUserId }, { aggregateType: "Household", aggregateId: householdId });
    return { ok: true };
  }

  async declineInvitation(token: string, userId: string) {
    const invitation = await this.findActiveInvitation(token);
    return this.declineActiveInvitation(invitation, userId);
  }

  async declineIncomingInvitation(invitationId: string, userId: string) {
    const invitation = await this.findActiveInvitationById(invitationId);
    return this.declineActiveInvitation(invitation, userId);
  }

  private async declineActiveInvitation(invitation: NonNullable<Awaited<ReturnType<HouseholdsService["findActiveInvitation"]>>>, userId: string) {
    await this.requireInvitee(invitation.contact, userId);
    await this.prisma.householdInvitation.update({ where: { id: invitation.id }, data: { status: "DECLINED", declinedAt: new Date() } });
    await this.events.publish("HouseholdInvitationDeclined", { householdId: invitation.householdId, invitationId: invitation.id, userId }, { aggregateType: "Household", aggregateId: invitation.householdId });
    return { ok: true };
  }

  /**
   * Batch 8 — membership changes. Household role and pet permissions stay
   * separate: removing or leaving ends the person's household-issued pet
   * grants (household, manual and temporary — never a provider's booking or
   * vet-share grant), while a role change only changes who may manage the
   * household. A household can never be left without an owner.
   */
  async removeMember(householdId: string, memberId: string, actorUserId: string) {
    await this.requireOwner(householdId, actorUserId);
    const member = await this.prisma.householdMember.findFirst({ where: { id: memberId, householdId } });
    if (!member) throw new NotFoundApiException("Member");
    if (member.userId === actorUserId) throw new ValidationApiException({ field: "memberId", reason: "Use “leave household” to remove yourself." });
    const copiedMemories = await this.prisma.$transaction(async (tx) => {
      if (member.role === HouseholdRole.OWNER) await this.assertAnotherOwner(tx, householdId, member.userId);
      // ID-02: the separated member keeps a read-only copy of the memories THEY
      // recorded. The originals stay with the pet and the household.
      const copied = await this.copySeparatedMemories(tx, householdId, member.userId);
      await tx.householdMember.delete({ where: { id: member.id } });
      const revoked = await this.revokeHouseholdGrants(tx, householdId, member.userId, actorUserId);
      await this.events.publish("HouseholdMemberRemoved", { householdId, userId: member.userId, actorUserId, revokedGrants: revoked, copiedMemories: copied }, { tx, aggregateType: "Household", aggregateId: householdId });
      return copied;
    });
    await this.notifications.notify({ userId: member.userId, type: "household.member_removed", category: "HOUSEHOLD", templateParams: {}, deepLink: NotificationDeepLinks.profileHousehold(), entityType: "Household", entityId: householdId }).catch(() => undefined);
    return { ok: true, copiedMemories };
  }

  async leave(householdId: string, userId: string) {
    const member = await this.prisma.householdMember.findUnique({ where: { householdId_userId: { householdId, userId } } });
    if (!member) throw new HouseholdAccessDeniedException({ householdId });
    const copiedMemories = await this.prisma.$transaction(async (tx) => {
      if (member.role === HouseholdRole.OWNER) await this.assertAnotherOwner(tx, householdId, userId);
      // ID-02: the separated member keeps a read-only copy of the memories THEY
      // recorded. The originals stay with the pet and the household.
      const copied = await this.copySeparatedMemories(tx, householdId, userId);
      await tx.householdMember.delete({ where: { id: member.id } });
      const revoked = await this.revokeHouseholdGrants(tx, householdId, userId, userId);
      await this.events.publish("HouseholdMemberLeft", { householdId, userId, revokedGrants: revoked, copiedMemories: copied }, { tx, aggregateType: "Household", aggregateId: householdId });
      // The transaction's result is what the caller sees, so the count must be
      // returned explicitly — the publish above resolves to undefined.
      return copied;
    });
    return { ok: true, copiedMemories };
  }

  /**
   * ID-02: "the separated member keeps a read-only copy of the memories they recorded".
   *
   * The copy points at the original memory row, which stays with the pet and its
   * household — this is a read grant, not a fork of the data, so the memory is never
   * duplicated or orphaned. Only the memories this person personally recorded are
   * copied, never the household's whole library. The unique index on
   * (memoryId, userId) makes a repeated separation idempotent.
   */
  private async copySeparatedMemories(tx: Prisma.TransactionClient, householdId: string, userId: string): Promise<number> {
    const memories = await tx.petMemory.findMany({
      where: { householdId, createdByUserId: userId },
      select: { id: true, petId: true },
    });
    if (!memories.length) return 0;
    const result = await tx.petMemoryCopy.createMany({
      data: memories.map((memory) => ({ memoryId: memory.id, userId, householdId, petId: memory.petId })),
      skipDuplicates: true,
    });
    return result.count;
  }

  async changeRole(householdId: string, memberId: string, role: HouseholdRole, actorUserId: string) {
    await this.requireOwner(householdId, actorUserId);
    const member = await this.prisma.householdMember.findFirst({ where: { id: memberId, householdId } });
    if (!member) throw new NotFoundApiException("Member");
    if (member.role === role) return { ok: true };
    await this.prisma.$transaction(async (tx) => {
      if (member.role === HouseholdRole.OWNER) await this.assertAnotherOwner(tx, householdId, member.userId);
      await tx.householdMember.update({ where: { id: member.id }, data: { role } });
      // A new owner can manage every pet; existing household grants are upgraded, never silently downgraded on demotion.
      if (role === HouseholdRole.OWNER) {
        const pets = await tx.pet.findMany({ where: { householdId, deletedAt: null }, select: { id: true } });
        for (const pet of pets) {
          await tx.petAccessGrant.updateMany({ where: { petId: pet.id, userId: member.userId, source: PetAccessSource.HOUSEHOLD, revokedAt: null }, data: { revokedAt: new Date(), revokedByUserId: actorUserId } });
          await tx.petAccessGrant.create({ data: { petId: pet.id, userId: member.userId, source: PetAccessSource.HOUSEHOLD, grantedByUserId: actorUserId, ...PRESETS.FULL, canManageAccess: true } });
        }
      }
      await this.events.publish("HouseholdMemberRoleChanged", { householdId, userId: member.userId, from: member.role, to: role, actorUserId }, { tx, aggregateType: "Household", aggregateId: householdId });
    });
    return { ok: true };
  }

  private async assertAnotherOwner(tx: Prisma.TransactionClient, householdId: string, excludingUserId: string) {
    // Lock the household's member rows so two concurrent demotions can't both pass the check.
    await tx.$queryRaw`SELECT id FROM household_members WHERE "householdId" = ${householdId}::uuid FOR UPDATE`;
    const owners = await tx.householdMember.count({ where: { householdId, role: HouseholdRole.OWNER, userId: { not: excludingUserId } } });
    if (owners === 0) throw new LastHouseholdOwnerException({ householdId });
  }

  private async revokeHouseholdGrants(tx: Prisma.TransactionClient, householdId: string, userId: string, actorUserId: string): Promise<number> {
    const result = await tx.petAccessGrant.updateMany({
      where: {
        userId,
        revokedAt: null,
        pet: { householdId },
        source: { in: [PetAccessSource.HOUSEHOLD, PetAccessSource.MANUAL, PetAccessSource.TEMPORARY] },
        // `reason` is usually null; a bare NOT would drop those rows (SQL NULL), so null is matched explicitly.
        OR: [{ reason: null }, { AND: [{ NOT: { reason: { endsWith: "_BOOKING" } } }, { NOT: { reason: "EXPLICIT_VET_SHARE" } }] }],
      },
      data: { revokedAt: new Date(), revokedByUserId: actorUserId },
    });
    return result.count;
  }

  private async requireOwner(householdId: string, userId: string) {
    const member = await this.prisma.householdMember.findUnique({ where: { householdId_userId: { householdId, userId } } });
    if (member?.role !== HouseholdRole.OWNER) throw new HouseholdAccessDeniedException({ householdId });
  }

  private async requireInvitee(contact: string, userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, phone: true, emailVerifiedAt: true, phoneVerifiedAt: true } });
    // An unverified matching phone may submit a request, but it never grants access. A verified email
    // remains supported for legacy invitations; typed email addresses are not treated as proof.
    const phoneMatches = Boolean(user.phone && normalizeStoredContact(user.phone) === contact);
    const emailMatches = Boolean(user.emailVerifiedAt && user.email && normalizeStoredContact(user.email) === contact);
    if (!phoneMatches && !emailMatches) throw new InvitationNotForYouException();
  }

  private async isPhoneVerified(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phoneVerifiedAt: true } });
    return Boolean(user.phoneVerifiedAt);
  }


  private async findActiveInvitation(token: string) {
    const invitation = await this.prisma.householdInvitation.findUnique({ where: { tokenHash: tokenHash(token) } });
    if (!invitation) throw new NotFoundApiException("Invitation");
    if (invitation.status === "REQUESTED" || invitation.status === "ACCEPTED" || invitation.status === "DECLINED") throw new InvitationAlreadyUsedException();
    if (invitation.status === "CANCELLED") throw new InvitationRevokedException();
    if (invitation.status === "EXPIRED") throw new InvitationExpiredException();
    if (invitation.expiresAt <= new Date()) {
      await this.prisma.householdInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
      throw new InvitationExpiredException();
    }
    return invitation;
  }

  private async findActiveInvitationById(id: string) {
    const invitation = await this.prisma.householdInvitation.findUnique({ where: { id } });
    if (!invitation) throw new NotFoundApiException("Invitation");
    if (invitation.status === "REQUESTED" || invitation.status === "ACCEPTED" || invitation.status === "DECLINED") throw new InvitationAlreadyUsedException();
    if (invitation.status === "CANCELLED") throw new InvitationRevokedException();
    if (invitation.status === "EXPIRED") throw new InvitationExpiredException();
    if (invitation.expiresAt <= new Date()) {
      await this.prisma.householdInvitation.update({ where: { id }, data: { status: "EXPIRED" } });
      throw new InvitationExpiredException();
    }
    return invitation;
  }


  private async expireInvitations(householdId: string) {
    await this.prisma.householdInvitation.updateMany({ where: { householdId, status: "PENDING", expiresAt: { lte: new Date() } }, data: { status: "EXPIRED" } });
  }
}
