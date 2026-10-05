import { Injectable } from "@nestjs/common";
import { BookingStatus, ClinicInvitationStatus, Prisma, ProviderUserRole } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  ClinicBranchInUseException,
  ClinicInvitationConflictException,
  ClinicMemberNotRemovableException,
  ClinicStaffAlreadyMemberException,
  NotFoundApiException,
  SubscriptionEntitlementLimitExceededException,
} from "../../common/errors/api-exception";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { ClinicEntitlementService } from "./clinic-entitlement.service";
import type { AddClinicBranchDto, AddClinicStaffDto } from "./dto/clinic-os.dto";

const ROLE_LABEL = { fa: { VET: "دامپزشک", STAFF: "کارمند", OWNER: "مدیر" }, en: { VET: "vet", STAFF: "staff member", OWNER: "owner" } } as const;
const INVITATION_TTL_MS = 7 * 86400e3;
/** Bookings that still need the assigned professional; removal unassigns them so the clinic can reassign. */
const OPEN_BOOKING: BookingStatus[] = [BookingStatus.HOLD, BookingStatus.REQUESTED, BookingStatus.PENDING_CONFIRMATION, BookingStatus.AWAITING_PAYMENT, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN];
const INVITATION_INCLUDE = { providerOrganization: { select: { id: true, name: true } }, invitedUser: { select: { displayName: true } } } satisfies Prisma.ClinicInvitationInclude;
type InvitationRow = Prisma.ClinicInvitationGetPayload<{ include: typeof INVITATION_INCLUDE }>;

/**
 * Clinic team seats and branches under the plan's LIMIT entitlements (`clinic.staff.max`, `clinic.branches.max`;
 * null = unlimited). Seats = active members + live PENDING invitations, so an owner can never invite past the limit.
 *
 * Joining is the invitee's choice: an owner invites an existing account, the invitee accepts or declines from
 * their own session, and only acceptance creates (or reactivates) the membership. Removal is soft — the member
 * row stays because their clinical records reference it, but `removedAt` takes away all access, their grants from
 * this clinic's bookings are revoked and their open bookings are unassigned. Owners are never removable here,
 * so a clinic can never lose its last owner.
 *
 * Every count-then-write runs under a NO KEY UPDATE lock on the organisation row; the plan is resolved before the
 * lock because resolving may lazily create the subscription row, whose FK check must not wait on that lock.
 */
@Injectable()
export class ClinicTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ClinicEntitlementService,
    private readonly events: DomainEventsService,
    private readonly notifications: NotificationOrchestratorService,
  ) {}

  // ------------------------------------------------------------------ staff (clinic side)

  async listStaff(ctx: ResolvedProviderContext) {
    const now = new Date();
    const [rows, pending, resolved] = await Promise.all([
      this.prisma.providerUser.findMany({ where: { providerOrganizationId: ctx.organizationId, removedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, role: true, displayTitle: true, createdAt: true, user: { select: { displayName: true } } } }),
      this.prisma.clinicInvitation.findMany({ where: { providerOrganizationId: ctx.organizationId, status: ClinicInvitationStatus.PENDING, expiresAt: { gt: now } }, orderBy: { createdAt: "asc" }, include: INVITATION_INCLUDE }),
      this.entitlements.resolve(ctx.organizationId),
    ]);
    return {
      items: rows.map((r) => ({ providerUserId: r.id, displayName: r.user.displayName, role: r.role, displayTitle: r.displayTitle, joinedAt: r.createdAt.toISOString() })),
      pendingInvitations: pending.map((i) => toInvitationDto(i, now)),
      usage: { used: rows.length, pending: pending.length, limit: resolved.entitlements["clinic.staff.max"]?.limit ?? null },
    };
  }

  /** Owner invites an existing account. The response is the roster plus the new PENDING invitation. */
  async invite(ctx: ResolvedProviderContext, dto: AddClinicStaffDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() }, select: { id: true, locale: true } });
    if (!user) throw new NotFoundApiException("User");
    const staffLimit = (await this.entitlements.resolve(ctx.organizationId)).entitlements["clinic.staff.max"]?.limit ?? null;
    const now = new Date();
    const invitation = await this.prisma.$transaction(async (tx) => {
      await this.lockOrganization(tx, ctx.organizationId);
      if (await tx.providerUser.count({ where: { providerOrganizationId: ctx.organizationId, userId: user.id, removedAt: null } })) throw new ClinicStaffAlreadyMemberException();
      // A lapsed PENDING invitation no longer holds a seat or blocks a new one.
      await tx.clinicInvitation.updateMany({ where: { providerOrganizationId: ctx.organizationId, invitedUserId: user.id, status: ClinicInvitationStatus.PENDING, expiresAt: { lte: now } }, data: { status: ClinicInvitationStatus.REVOKED, respondedAt: now } });
      if (await tx.clinicInvitation.count({ where: { providerOrganizationId: ctx.organizationId, invitedUserId: user.id, status: ClinicInvitationStatus.PENDING } })) throw new ClinicInvitationConflictException({ reason: "ALREADY_PENDING" });
      assertBelow("clinic.staff.max", staffLimit, await this.seatsInUse(tx, ctx.organizationId, now));
      const row = await tx.clinicInvitation.create({
        data: { providerOrganizationId: ctx.organizationId, invitedUserId: user.id, role: dto.role === "VET" ? ProviderUserRole.VET : ProviderUserRole.STAFF, displayTitle: dto.displayTitle?.trim() || null, invitedByProviderUserId: ctx.providerUserId, expiresAt: new Date(now.getTime() + INVITATION_TTL_MS) },
        include: INVITATION_INCLUDE,
      });
      await this.events.publish("ClinicStaffInvited", { providerOrganizationId: ctx.organizationId, invitationId: row.id, invitedByProviderUserId: ctx.providerUserId }, { aggregateType: "ProviderOrganization", aggregateId: ctx.organizationId, tx });
      return row;
    });
    const locale = user.locale === "en" ? "en" : "fa";
    await this.notifications.notify({
      userId: user.id,
      type: "clinic.staff_invited",
      category: "SYSTEM",
      deepLink: NotificationDeepLinks.clinicInvitations(),
      entityType: "ClinicInvitation",
      entityId: invitation.id,
      actorType: "PROVIDER_ORGANIZATION",
      actorId: ctx.organizationId,
      templateParams: { clinic: ctx.organizationName, role: ROLE_LABEL[locale][invitation.role] },
    });
    return { invitation: toInvitationDto(invitation, now), ...(await this.listStaff(ctx)) };
  }

  async revokeInvitation(ctx: ResolvedProviderContext, invitationId: string) {
    const updated = await this.prisma.clinicInvitation.updateMany({ where: { id: invitationId, providerOrganizationId: ctx.organizationId, status: ClinicInvitationStatus.PENDING }, data: { status: ClinicInvitationStatus.REVOKED, respondedAt: new Date() } });
    if (!updated.count) {
      const row = await this.prisma.clinicInvitation.findFirst({ where: { id: invitationId, providerOrganizationId: ctx.organizationId } });
      if (!row) throw new NotFoundApiException("ClinicInvitation");
      throw new ClinicInvitationConflictException({ reason: "NOT_PENDING", status: row.status });
    }
    await this.events.publish("ClinicInvitationRevoked", { providerOrganizationId: ctx.organizationId, invitationId, revokedByProviderUserId: ctx.providerUserId }, { aggregateType: "ProviderOrganization", aggregateId: ctx.organizationId });
    return this.listStaff(ctx);
  }

  /** Soft removal of a VET/STAFF member. */
  async removeMember(ctx: ResolvedProviderContext, providerUserId: string) {
    const now = new Date();
    const removed = await this.prisma.$transaction(async (tx) => {
      await this.lockOrganization(tx, ctx.organizationId);
      const member = await tx.providerUser.findFirst({ where: { id: providerUserId, providerOrganizationId: ctx.organizationId, removedAt: null } });
      if (!member) throw new NotFoundApiException("Team member");
      if (member.role === ProviderUserRole.OWNER) throw new ClinicMemberNotRemovableException({ reason: "OWNER" });
      await tx.providerUser.update({ where: { id: member.id }, data: { removedAt: now, removedByProviderUserId: ctx.providerUserId } });
      // Access this person held through this clinic's bookings ends with the membership.
      const grants = await tx.bookingPetAccess.findMany({ where: { booking: { providerOrganizationId: ctx.organizationId }, petAccessGrant: { userId: member.userId, revokedAt: null } }, select: { petAccessGrantId: true } });
      if (grants.length) await tx.petAccessGrant.updateMany({ where: { id: { in: grants.map((g) => g.petAccessGrantId) } }, data: { revokedAt: now, revokedByUserId: ctx.userId } });
      // Open appointments go back to the clinic for reassignment rather than pointing at someone without access.
      const unassigned = await tx.booking.updateMany({ where: { providerOrganizationId: ctx.organizationId, providerUserId: member.id, bookingStatus: { in: OPEN_BOOKING } }, data: { providerUserId: null } });
      await tx.providerContextPreference.deleteMany({ where: { userId: member.userId, providerOrganizationId: ctx.organizationId } });
      await this.events.publish("ClinicStaffRemoved", { providerOrganizationId: ctx.organizationId, providerUserId: member.id, removedByProviderUserId: ctx.providerUserId, revokedGrants: grants.length, unassignedBookings: unassigned.count }, { aggregateType: "ProviderOrganization", aggregateId: ctx.organizationId, tx });
      return member;
    });
    await this.notifications.notify({
      userId: removed.userId,
      type: "clinic.staff_removed",
      category: "SYSTEM",
      deepLink: NotificationDeepLinks.notificationCenter(),
      entityType: "ProviderUser",
      entityId: removed.id,
      actorType: "PROVIDER_ORGANIZATION",
      actorId: ctx.organizationId,
      templateParams: { clinic: ctx.organizationName },
    });
    return this.listStaff(ctx);
  }

  // ------------------------------------------------------------------ invitations (invitee side)

  async myInvitations(userId: string) {
    const now = new Date();
    const rows = await this.prisma.clinicInvitation.findMany({ where: { invitedUserId: userId, status: ClinicInvitationStatus.PENDING, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" }, include: INVITATION_INCLUDE });
    return rows.map((r) => toInvitationDto(r, now));
  }

  async accept(userId: string, invitationId: string) {
    const invitation = await this.ownPending(userId, invitationId);
    const staffLimit = (await this.entitlements.resolve(invitation.providerOrganizationId)).entitlements["clinic.staff.max"]?.limit ?? null;
    const now = new Date();
    const member = await this.prisma.$transaction(async (tx) => {
      await this.lockOrganization(tx, invitation.providerOrganizationId);
      const claimed = await tx.clinicInvitation.updateMany({ where: { id: invitation.id, status: ClinicInvitationStatus.PENDING, expiresAt: { gt: now } }, data: { status: ClinicInvitationStatus.ACCEPTED, respondedAt: now } });
      if (!claimed.count) throw new ClinicInvitationConflictException({ reason: "NOT_PENDING" });
      if (await tx.providerUser.count({ where: { providerOrganizationId: invitation.providerOrganizationId, userId, removedAt: null } })) throw new ClinicStaffAlreadyMemberException();
      // The invitation reserved a seat; still refuse if the plan shrank below the active team since.
      assertBelow("clinic.staff.max", staffLimit, await tx.providerUser.count({ where: { providerOrganizationId: invitation.providerOrganizationId, removedAt: null } }));
      const previous = await tx.providerUser.findFirst({ where: { providerOrganizationId: invitation.providerOrganizationId, userId }, orderBy: { createdAt: "desc" } });
      const row = previous
        ? await tx.providerUser.update({ where: { id: previous.id }, data: { removedAt: null, removedByProviderUserId: null, role: invitation.role, displayTitle: invitation.displayTitle } })
        : await tx.providerUser.create({ data: { userId, providerOrganizationId: invitation.providerOrganizationId, role: invitation.role, displayTitle: invitation.displayTitle } });
      await tx.clinicInvitation.update({ where: { id: invitation.id }, data: { acceptedProviderUserId: row.id } });
      await this.events.publish("ClinicInvitationAccepted", { providerOrganizationId: invitation.providerOrganizationId, invitationId: invitation.id, providerUserId: row.id }, { aggregateType: "ProviderOrganization", aggregateId: invitation.providerOrganizationId, tx });
      return row;
    });
    await this.notifyOwners(invitation.providerOrganizationId, "clinic.invitation_accepted", invitation.id, invitation.invitedUser.displayName);
    return { providerUserId: member.id, providerOrganizationId: invitation.providerOrganizationId, organizationName: invitation.providerOrganization.name, role: member.role };
  }

  async decline(userId: string, invitationId: string) {
    const invitation = await this.ownPending(userId, invitationId);
    const claimed = await this.prisma.clinicInvitation.updateMany({ where: { id: invitation.id, status: ClinicInvitationStatus.PENDING }, data: { status: ClinicInvitationStatus.DECLINED, respondedAt: new Date() } });
    if (!claimed.count) throw new ClinicInvitationConflictException({ reason: "NOT_PENDING" });
    await this.events.publish("ClinicInvitationDeclined", { providerOrganizationId: invitation.providerOrganizationId, invitationId: invitation.id }, { aggregateType: "ProviderOrganization", aggregateId: invitation.providerOrganizationId });
    await this.notifyOwners(invitation.providerOrganizationId, "clinic.invitation_declined", invitation.id, invitation.invitedUser.displayName);
    return { status: ClinicInvitationStatus.DECLINED };
  }

  // ------------------------------------------------------------------ branches

  async listBranches(ctx: ResolvedProviderContext) {
    const [rows, resolved] = await Promise.all([
      this.prisma.providerLocation.findMany({ where: { providerOrganizationId: ctx.organizationId }, orderBy: { createdAt: "asc" } }),
      this.entitlements.resolve(ctx.organizationId),
    ]);
    return {
      items: rows.map((l) => ({ id: l.id, name: l.name, addressLine: l.addressLine, city: l.city, region: l.region, latitude: l.latitude, longitude: l.longitude, phone: l.phone, timezone: l.timezone })),
      usage: { used: rows.length, limit: resolved.entitlements["clinic.branches.max"]?.limit ?? null },
    };
  }

  async addBranch(ctx: ResolvedProviderContext, dto: AddClinicBranchDto) {
    const branchLimit = (await this.entitlements.resolve(ctx.organizationId)).entitlements["clinic.branches.max"]?.limit ?? null;
    await this.prisma.$transaction(async (tx) => {
      await this.lockOrganization(tx, ctx.organizationId);
      assertBelow("clinic.branches.max", branchLimit, await tx.providerLocation.count({ where: { providerOrganizationId: ctx.organizationId } }));
      const row = await tx.providerLocation.create({
        data: { providerOrganizationId: ctx.organizationId, name: dto.name.trim(), addressLine: dto.addressLine.trim(), city: dto.city.trim(), region: dto.region?.trim() || null, latitude: dto.latitude ?? null, longitude: dto.longitude ?? null, phone: dto.phone?.trim() || null, countryCode: "IR", timezone: "Asia/Tehran" },
      });
      await this.events.publish("ClinicBranchAdded", { providerOrganizationId: ctx.organizationId, locationId: row.id }, { aggregateType: "ProviderOrganization", aggregateId: ctx.organizationId, tx });
    });
    return this.listBranches(ctx);
  }

  /**
   * A branch is removed only when nothing operational points at it: not the last branch, no bookings ever made
   * there (history stays intact), and no services, resources or availability tied to it.
   */
  async removeBranch(ctx: ResolvedProviderContext, locationId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockOrganization(tx, ctx.organizationId);
      const branch = await tx.providerLocation.findFirst({ where: { id: locationId, providerOrganizationId: ctx.organizationId } });
      if (!branch) throw new NotFoundApiException("Branch");
      if ((await tx.providerLocation.count({ where: { providerOrganizationId: ctx.organizationId } })) <= 1) throw new ClinicBranchInUseException({ reason: "LAST_BRANCH" });
      const [bookings, services, resources, rules] = await Promise.all([
        tx.booking.count({ where: { providerLocationId: branch.id } }),
        tx.providerService.count({ where: { locationId: branch.id } }),
        tx.providerResource.count({ where: { locationId: branch.id } }),
        tx.providerAvailabilityRule.count({ where: { locationId: branch.id } }),
      ]);
      if (bookings) throw new ClinicBranchInUseException({ reason: "HAS_BOOKINGS", count: bookings });
      if (services || resources || rules) throw new ClinicBranchInUseException({ reason: "HAS_SERVICES_OR_SCHEDULE", services, resources, availabilityRules: rules });
      await tx.providerLocation.delete({ where: { id: branch.id } });
      await this.events.publish("ClinicBranchRemoved", { providerOrganizationId: ctx.organizationId, locationId: branch.id, removedByProviderUserId: ctx.providerUserId }, { aggregateType: "ProviderOrganization", aggregateId: ctx.organizationId, tx });
    });
    return this.listBranches(ctx);
  }

  // ------------------------------------------------------------------ helpers

  private async lockOrganization(tx: Prisma.TransactionClient, organizationId: string) {
    await tx.$queryRaw`SELECT id FROM "provider_organizations" WHERE id = ${organizationId}::uuid FOR NO KEY UPDATE`;
  }

  private async seatsInUse(tx: Prisma.TransactionClient, organizationId: string, now: Date) {
    const [members, pending] = await Promise.all([
      tx.providerUser.count({ where: { providerOrganizationId: organizationId, removedAt: null } }),
      tx.clinicInvitation.count({ where: { providerOrganizationId: organizationId, status: ClinicInvitationStatus.PENDING, expiresAt: { gt: now } } }),
    ]);
    return members + pending;
  }

  /** The invitee's own live invitation; anyone else's or an unknown id is the same 404. */
  private async ownPending(userId: string, invitationId: string): Promise<InvitationRow> {
    const row = await this.prisma.clinicInvitation.findFirst({ where: { id: invitationId, invitedUserId: userId }, include: INVITATION_INCLUDE });
    if (!row) throw new NotFoundApiException("ClinicInvitation");
    if (row.status !== ClinicInvitationStatus.PENDING) throw new ClinicInvitationConflictException({ reason: "NOT_PENDING", status: row.status });
    if (row.expiresAt <= new Date()) throw new ClinicInvitationConflictException({ reason: "EXPIRED" });
    return row;
  }

  private async notifyOwners(organizationId: string, type: "clinic.invitation_accepted" | "clinic.invitation_declined", invitationId: string, name: string) {
    const owners = await this.prisma.providerUser.findMany({ where: { providerOrganizationId: organizationId, role: ProviderUserRole.OWNER, removedAt: null }, select: { userId: true } });
    for (const o of owners) {
      await this.notifications.notify({ userId: o.userId, type, category: "SYSTEM", deepLink: NotificationDeepLinks.providerTeam(), entityType: "ClinicInvitation", entityId: invitationId, templateParams: { name } });
    }
  }
}

function toInvitationDto(i: InvitationRow, now: Date) {
  return {
    id: i.id,
    organization: { id: i.providerOrganization.id, name: i.providerOrganization.name },
    invitedDisplayName: i.invitedUser.displayName,
    role: i.role,
    displayTitle: i.displayTitle,
    status: i.status === ClinicInvitationStatus.PENDING && i.expiresAt <= now ? "EXPIRED" : i.status,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
  };
}

/** null = unlimited; otherwise `used` must still be below the plan's limit before adding one more. */
function assertBelow(key: string, limit: number | null, used: number) {
  if (limit !== null && used >= limit) throw new SubscriptionEntitlementLimitExceededException({ key, limit, used, context: "CLINIC" });
}
