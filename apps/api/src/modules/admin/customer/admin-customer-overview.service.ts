import { Injectable } from "@nestjs/common";
import { AdminMembershipStatus, DisputeStatus, SupportCaseStatus, UserAccountStatus } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { AdminGovernanceRuleException, NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { roleHasPermission } from "../auth/admin-permissions";

const mask = (v: string | null) => {
  if (!v) return null;
  const [name, domain] = v.split("@");
  return domain ? `${(name ?? "").slice(0, 2)}***@${domain}` : `${v.slice(0, 4)}***${v.slice(-2)}`;
};
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const OPEN_CASES: SupportCaseStatus[] = [SupportCaseStatus.OPEN, SupportCaseStatus.IN_PROGRESS, SupportCaseStatus.WAITING_ON_USER, SupportCaseStatus.WAITING_ON_INTERNAL];
const OPEN_DISPUTES: DisputeStatus[] = [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW, DisputeStatus.AWAITING_EVIDENCE];

/**
 * ERP-B Customer 360 overview: counts and states across every domain for one member, plus the account actions
 * (suspend / unsuspend / revoke sessions). Deliberately metadata only — no medical content, no chat message bodies,
 * contacts masked (reveal stays the audited POST /admin/customers/:id/reveal). The finance block is only filled for
 * admins holding finance.view; others get `{ restricted: true }`.
 */
@Injectable()
export class AdminCustomerOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly events: DomainEventsService,
  ) {}

  async overview(admin: ResolvedAdminContext, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { adminUser: { select: { role: true, status: true } }, authIdentities: { select: { provider: true } } } });
    if (!user) throw new NotFoundApiException("Customer");
    const now = new Date();
    const [memberships, sessions, lastSeen, bookingStatuses, orders, cases, disputes, notifications, consents, deletion, exportsCount, posts, comments, reportsFiled, reportsAgainst, blocksMade, blockedBy, conversations, donations, follows, volunteers, saved, recents, auditRows] = await Promise.all([
      this.prisma.householdMember.findMany({ where: { userId }, include: { household: { include: { _count: { select: { pets: true, members: true } }, subscription: { include: { plan: { select: { code: true } }, currentPeriod: { select: { endAt: true } } } }, entitlementOverrides: { where: { active: true }, select: { key: true, expiresAt: true } } } } } }),
      this.prisma.session.count({ where: { userId, revokedAt: null, expiresAt: { gt: now } } }),
      this.prisma.session.findFirst({ where: { userId }, orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } }),
      this.prisma.booking.groupBy({ by: ["bookingStatus"], where: { userId }, _count: { _all: true } }),
      this.prisma.order.aggregate({ where: { userId }, _count: { _all: true }, _sum: { totalAmount: true } }),
      this.prisma.supportCase.groupBy({ by: ["status"], where: { requesterUserId: userId }, _count: { _all: true } }),
      this.prisma.dispute.groupBy({ by: ["status"], where: { raisedByUserId: userId }, _count: { _all: true } }),
      this.prisma.notification.aggregate({ where: { userId, createdAt: { gte: new Date(now.getTime() - 30 * 86400e3) } }, _count: { _all: true } }),
      this.prisma.userConsent.findMany({ where: { userId }, select: { kind: true, version: true, grantedAt: true, revokedAt: true } }),
      this.prisma.accountDeletionRequest.findFirst({ where: { userId }, orderBy: { requestedAt: "desc" }, select: { id: true, state: true, requestedAt: true } }),
      this.prisma.dataExportRequest.count({ where: { userId } }),
      this.prisma.communityPost.count({ where: { authorUserId: userId } }),
      this.prisma.communityComment.count({ where: { authorUserId: userId } }),
      this.prisma.communityReport.count({ where: { reporterUserId: userId } }),
      this.prisma.communityReport.count({ where: { OR: [{ post: { authorUserId: userId } }, { comment: { authorUserId: userId } }] } }),
      this.prisma.userBlock.count({ where: { blockerUserId: userId } }),
      this.prisma.userBlock.count({ where: { blockedUserId: userId } }),
      this.prisma.chatParticipant.count({ where: { userId } }),
      this.prisma.donationIntent.aggregate({ where: { donorUserId: userId, status: "SUCCEEDED" }, _count: { _all: true }, _sum: { amountIrr: true } }),
      this.prisma.animalSupportOrgFollow.count({ where: { userId } }),
      this.prisma.volunteerInterest.count({ where: { userId } }),
      Promise.all([this.prisma.providerFavorite.count({ where: { userId } }), this.prisma.productFavorite.count({ where: { userId } }), this.prisma.petFriendlyPlaceFavorite.count({ where: { userId } }), this.prisma.travelListingFavorite.count({ where: { userId } }), this.prisma.communityPostBookmark.count({ where: { userId } }), this.prisma.supportNeedBookmark.count({ where: { userId } })]),
      this.prisma.recentlyViewed.count({ where: { userId } }),
      this.prisma.adminAuditLog.findMany({ where: { entityType: { in: ["USER", "User"] }, entityId: userId }, orderBy: { createdAt: "desc" }, take: 10, include: { adminUser: { select: { role: true, user: { select: { displayName: true } } } } } }),
    ]);
    const finance = roleHasPermission(admin.role, "finance.view") ? await this.finance(userId) : { restricted: true as const };
    const count = <T extends { _count: { _all: number } }>(rows: T[], pick: (r: T) => boolean) => rows.filter(pick).reduce((n, r) => n + r._count._all, 0);
    return {
      identity: {
        id: user.id, displayName: user.displayName, emailMasked: mask(user.email), phoneMasked: mask(user.phone), emailVerified: Boolean(user.emailVerifiedAt), phoneVerified: Boolean(user.phoneVerifiedAt),
        hasPassword: Boolean(user.passwordHash), signInMethods: [...new Set(user.authIdentities.map((a) => a.provider))], locale: user.locale, createdAt: iso(user.createdAt),
        isStaff: Boolean(user.adminUser && user.adminUser.status === AdminMembershipStatus.ACTIVE), staffRole: user.adminUser?.role ?? null,
      },
      account: { status: user.accountStatus, suspendedAt: iso(user.suspendedAt), suspendedReason: user.suspendedReason, activeSessions: sessions, lastSeenAt: iso(lastSeen?.lastSeenAt) },
      households: memberships.map((m) => ({
        id: m.household.id, name: m.household.name, role: m.role, petCount: m.household._count.pets, memberCount: m.household._count.members,
        subscription: m.household.subscription ? { planCode: m.household.subscription.plan.code, status: m.household.subscription.status, trialEndsAt: iso(m.household.subscription.trialEndsAt), cancelEffectiveAt: iso(m.household.subscription.cancelEffectiveAt), currentPeriodEndsAt: iso(m.household.subscription.currentPeriod?.endAt) } : null,
        entitlementOverrides: m.household.entitlementOverrides.map((o) => ({ key: o.key, expiresAt: iso(o.expiresAt) })),
      })),
      bookings: { total: count(bookingStatuses, () => true), byStatus: Object.fromEntries(bookingStatuses.map((b) => [b.bookingStatus, b._count._all])) },
      orders: { total: orders._count._all, totalAmountIrr: orders._sum.totalAmount ?? 0 },
      finance,
      support: { openCases: count(cases, (c) => OPEN_CASES.includes(c.status)), totalCases: count(cases, () => true), openDisputes: count(disputes, (d) => OPEN_DISPUTES.includes(d.status)), totalDisputes: count(disputes, () => true) },
      notifications: { last30Days: notifications._count._all },
      privacy: { consents: consents.map((c) => ({ kind: c.kind, version: c.version, granted: Boolean(c.grantedAt && !c.revokedAt) })), latestDeletionRequest: deletion ? { id: deletion.id, state: deletion.state, requestedAt: iso(deletion.requestedAt) } : null, exportRequests: exportsCount },
      community: { posts, comments, reportsFiled, reportsAgainstContent: reportsAgainst, blocksMade, blockedByOthers: blockedBy, conversations },
      animalSupport: { donations: donations._count._all, donatedIrr: donations._sum.amountIrr ?? 0, organizationsFollowed: follows, volunteerInterests: volunteers },
      saved: { providers: saved[0], products: saved[1], places: saved[2], travelListings: saved[3], posts: saved[4], supportNeeds: saved[5], recentlyViewed: recents },
      recentAdminActions: auditRows.map((a) => ({ id: a.id, action: a.action, reason: a.reason, at: a.createdAt.toISOString(), admin: { displayName: a.adminUser.user.displayName, role: a.adminUser.role } })),
      links: { customer360: `/admin/customers/${userId}`, notes: `/admin/notes?entityType=USER&entityId=${userId}`, audit: `/admin/audit?entityType=User&entityId=${userId}` },
    };
  }

  private async finance(userId: string) {
    const [intents, refunds, refundRequests] = await Promise.all([
      this.prisma.paymentIntent.groupBy({ by: ["status"], where: { checkout: { userId } }, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.refund.groupBy({ by: ["status"], where: { order: { userId } }, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.orderRefundRequest.count({ where: { userId } }),
    ]);
    return {
      restricted: false as const,
      paymentIntents: intents.map((i) => ({ status: i.status, count: i._count._all, amountIrr: i._sum.amount ?? 0 })),
      refunds: refunds.map((r) => ({ status: r.status, count: r._count._all, amountIrr: r._sum.amount ?? 0 })),
      refundRequests,
    };
  }

  async setAccountStatus(admin: ResolvedAdminContext, userId: string, status: UserAccountStatus, reason: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, include: { adminUser: { select: { status: true } } } });
      if (!user) throw new NotFoundApiException("Customer");
      if (user.id === admin.userId) throw new AdminGovernanceRuleException({ rule: "SELF_CHANGE_FORBIDDEN" });
      // Staff accounts are governed by Access Control (suspend the admin membership there first).
      if (status === UserAccountStatus.SUSPENDED && user.adminUser?.status === AdminMembershipStatus.ACTIVE) throw new AdminGovernanceRuleException({ rule: "STAFF_ACCOUNT" });
      const done = await tx.user.updateMany({ where: { id: userId, accountStatus: { not: status } }, data: status === UserAccountStatus.SUSPENDED ? { accountStatus: status, suspendedAt: new Date(), suspendedReason: reason, suspendedByAdminId: admin.adminUserId } : { accountStatus: status, suspendedAt: null, suspendedReason: null, suspendedByAdminId: null } });
      if (!done.count) throw new ValidationApiException({ field: "status", reason: "UNCHANGED" });
      const revoked = status === UserAccountStatus.SUSPENDED ? (await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })).count : 0;
      await this.audit.record({ adminUserId: admin.adminUserId, action: status === UserAccountStatus.SUSPENDED ? "customer.suspended" : "customer.unsuspended", entityType: "User", entityId: userId, reason, beforeSummary: { accountStatus: user.accountStatus }, afterSummary: { accountStatus: status, sessionsRevoked: revoked }, tx });
      await this.events.publish(status === UserAccountStatus.SUSPENDED ? "UserAccountSuspended" : "UserAccountReinstated", { userId, actorAdminUserId: admin.adminUserId }, { tx, aggregateType: "User", aggregateId: userId });
      return { accountStatus: status, sessionsRevoked: revoked };
    });
    return result;
  }

  async revokeSessions(admin: ResolvedAdminContext, userId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.user.count({ where: { id: userId } }))) throw new NotFoundApiException("Customer");
      if (userId === admin.userId) throw new AdminGovernanceRuleException({ rule: "SELF_CHANGE_FORBIDDEN" });
      const { count } = await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "customer.sessions_revoked", entityType: "User", entityId: userId, reason, afterSummary: { sessionsRevoked: count }, tx });
      return { sessionsRevoked: count };
    });
  }
}

