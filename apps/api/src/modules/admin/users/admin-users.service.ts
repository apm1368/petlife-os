import { Injectable } from "@nestjs/common";
import { NotificationCategory, Prisma, ProviderType } from "@prisma/client";
import type {
  AdminUserDirectoryListDto,
  AdminUserDirectoryRowDto,
  AdminUserBusinessDto,
  AdminUserProfileDto,
  AdminUserReviewSummaryDto,
  AdminUserRoleDto,
  AdminUserRoleKind,
  AdminUserBehaviorSummaryDto,
  AdminUserBehaviorDto,
  AdminUserTimelineEntryDto,
} from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AdminCustomerNotFoundException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../../common/pagination/pagination.dto";
import { maskPhone } from "../../../common/phone/phone-normalizer";
import { maskEmail } from "../../../common/pii/pii-mask.util";
import { AdminCustomerService } from "../customer/admin-customer.service";
import { NotificationOrchestratorService } from "../../notifications/notification-orchestrator.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { CUSTOMER_METRIC_CTES, CUSTOMER_METRIC_JOINS, customerMetricColumns, type CustomerMetricRow } from "../reports/customer-metrics.sql";
import { TEHRAN_OFFSET_MS } from "../reports/report-range";
import type { ListUsersQueryDto, UserSort } from "./dto/list-users-query.dto";

/** Which directory kind a provider organization reads as, from its ProviderType. */
function providerKind(type: ProviderType): AdminUserRoleKind {
  switch (type) {
    case ProviderType.VET_CLINIC:
    case ProviderType.VET_HOSPITAL:
    case ProviderType.VETERINARIAN:
      return "CLINIC";
    case ProviderType.GROOMER:
      return "GROOMER";
    case ProviderType.TRAVEL_ACCOMMODATION:
      return "HOST";
    default:
      return "PROVIDER_OTHER";
  }
}

export type UserDirectoryFilter = Partial<ListUsersQueryDto>;
type DirectoryUser = { id: string; displayName: string; email: string | null; phone: string | null; accountStatus: string; createdAt: Date; lastActiveAt: Date | null };

/**
 * W2-5. One row per person across every source of a platform relationship — internal admins,
 * customers (a household membership), provider staff (clinic / groomer / host / other), shop staff,
 * insurers and NGO members. A person who wears several hats is one row with several roles.
 *
 * The list remains a thin aggregation: pagination lives on `User`, and the six membership sources are
 * read only for the current page. The detail endpoint composes the existing Customer 360 read model with
 * every linked business, review and direct user audit entry, returning bounded collections for its tabs.
 *
 * Two of the six sources (insurer and NGO memberships) store `userId` without a Prisma relation, by the
 * same actor-reference convention they were written with, so they are queried by id list rather than
 * `include`d from User.
 */
/** Whitelisted ORDER BY clauses; ids break ties so pages never overlap. */
const USER_ORDER: Record<UserSort, Prisma.Sql> = {
  newest: Prisma.sql`x."createdAt" DESC, x.id DESC`,
  oldest: Prisma.sql`x."createdAt" ASC, x.id ASC`,
  lastActive: Prisma.sql`x."engagedAt" DESC NULLS LAST, x.id DESC`,
  spend: Prisma.sql`x."totalSpend" DESC, x.id DESC`,
  orders: Prisma.sql`x."orderCount" DESC, x.id DESC`,
  bookings: Prisma.sql`(x."serviceBookingCount" + x."travelBookingCount") DESC, x.id DESC`,
};

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: AdminCustomerService,
    private readonly notifications: NotificationOrchestratorService,
    private readonly audit: AdminAuditLogService,
  ) {}

  private behavior(row: CustomerMetricRow): AdminUserBehaviorSummaryDto {
    return {
      orderCount: Number(row.orderCount),
      totalSpend: Number(row.totalSpend),
      lastOrderAt: row.lastOrderAt?.toISOString() ?? null,
      serviceBookingCount: Number(row.serviceBookingCount),
      travelBookingCount: Number(row.travelBookingCount),
      lastBookingAt: row.lastBookingAt?.toISOString() ?? null,
      cancelledCount: Number(row.cancelledCount),
      noShowCount: Number(row.noShowCount),
      supportCaseCount: Number(row.supportCaseCount),
      segment: row.segment,
    };
  }

  private row(user: DirectoryUser, roles: AdminUserRoleDto[], metrics?: CustomerMetricRow): AdminUserDirectoryRowDto {
    return {
      ...(metrics ? { behavior: this.behavior(metrics) } : {}),
      id: user.id,
      displayName: user.displayName,
      emailMasked: user.email ? maskEmail(user.email) : null,
      phoneMasked: user.phone ? maskPhone(user.phone) : null,
      accountStatus: user.accountStatus as "ACTIVE" | "SUSPENDED",
      createdAt: user.createdAt.toISOString(),
      lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
      roles,
    };
  }

  /** An EXISTS predicate keeps role filtering and pagination inside PostgreSQL instead of loading all member ids. */
  private kindPredicate(kind: AdminUserRoleKind): Prisma.Sql {
    switch (kind) {
      case "ADMIN_INTERNAL":
        return Prisma.sql`EXISTS (SELECT 1 FROM admin_users m WHERE m."userId" = u.id)`;
      case "CUSTOMER":
        return Prisma.sql`EXISTS (SELECT 1 FROM household_members m WHERE m."userId" = u.id)`;
      case "SHOP":
        return Prisma.sql`EXISTS (SELECT 1 FROM seller_memberships m WHERE m."userId" = u.id AND m.status::text = 'ACTIVE')`;
      case "INSURER":
        return Prisma.sql`EXISTS (SELECT 1 FROM insurer_memberships m WHERE m."userId" = u.id AND m."isActive" = true)`;
      case "NGO":
        return Prisma.sql`EXISTS (SELECT 1 FROM animal_support_org_memberships m WHERE m."userId" = u.id AND m."isActive" = true)`;
      case "CLINIC":
      case "GROOMER":
      case "HOST":
      case "PROVIDER_OTHER": {
        const types = (Object.values(ProviderType) as ProviderType[]).filter((t) => providerKind(t) === kind);
        return Prisma.sql`EXISTS (
          SELECT 1 FROM provider_users m
          JOIN provider_organizations p ON p.id = m."providerOrganizationId"
          WHERE m."userId" = u.id AND m."removedAt" IS NULL
          AND p.type::text IN (${Prisma.join(types)})
        )`;
      }
    }
  }

  /** Every hat the given user ids wear, grouped by user id. One query per source, each scoped to the page. */
  private async rolesByUser(userIds: string[]): Promise<Map<string, AdminUserRoleDto[]>> {
    const map = new Map<string, AdminUserRoleDto[]>();
    const push = (userId: string, role: AdminUserRoleDto) => {
      const list = map.get(userId) ?? [];
      list.push(role);
      map.set(userId, list);
    };
    if (userIds.length === 0) return map;
    const inPage = { userId: { in: userIds } };

    const [admins, households, providers, sellers, insurers, ngos] = await Promise.all([
      this.prisma.adminUser.findMany({ where: inPage, select: { userId: true, role: true } }),
      this.prisma.householdMember.findMany({ where: inPage, select: { userId: true, role: true } }),
      this.prisma.providerUser.findMany({ where: { ...inPage, removedAt: null }, select: { userId: true, role: true, providerOrganization: { select: { id: true, name: true, type: true, verificationStatus: true } } } }),
      this.prisma.sellerMembership.findMany({ where: { ...inPage, status: "ACTIVE" }, select: { userId: true, role: true, sellerOrganization: { select: { id: true, name: true, verificationStatus: true } } } }),
      this.prisma.insurerMembership.findMany({ where: { ...inPage, isActive: true }, select: { userId: true, role: true, provider: { select: { id: true, name: true, status: true } } } }),
      this.prisma.animalSupportOrgMembership.findMany({ where: { ...inPage, isActive: true }, select: { userId: true, role: true, organization: { select: { id: true, name: true, verificationStatus: true } } } }),
    ]);

    for (const a of admins) push(a.userId, { kind: "ADMIN_INTERNAL", role: a.role, business: null });
    // A household is not a business; a customer row carries no linked business. Collapse the several
    // household memberships a user may hold into one CUSTOMER hat rather than one per household.
    for (const userId of new Set(households.map((h) => h.userId))) {
      const roles = households.filter((h) => h.userId === userId).map((h) => h.role);
      push(userId, { kind: "CUSTOMER", role: roles.includes("OWNER") ? "OWNER" : roles[0]!, business: null });
    }
    for (const p of providers) push(p.userId, { kind: providerKind(p.providerOrganization.type), role: p.role, business: { id: p.providerOrganization.id, name: p.providerOrganization.name, verificationStatus: p.providerOrganization.verificationStatus } });
    for (const s of sellers) push(s.userId, { kind: "SHOP", role: s.role, business: { id: s.sellerOrganization.id, name: s.sellerOrganization.name, verificationStatus: s.sellerOrganization.verificationStatus } });
    for (const i of insurers) push(i.userId, { kind: "INSURER", role: i.role, business: { id: i.provider.id, name: i.provider.name, verificationStatus: i.provider.status } });
    for (const n of ngos) push(n.userId, { kind: "NGO", role: n.role, business: { id: n.organization.id, name: n.organization.name, verificationStatus: n.organization.verificationStatus } });

    return map;
  }

  /**
   * The directory with behaviour: one PostgreSQL statement filters on identity, relationship kind, account
   * status, signup window and the customer roll-up (orders, spend, bookings, stays, cancellations, support,
   * last engagement, segment), then sorts and paginates — nothing is filtered in memory.
   */
  async list(filter: UserDirectoryFilter, now = new Date()): Promise<AdminUserDirectoryListDto> {
    const { page, pageSize, skip, take } = resolvePagination(filter);
    const inner: Prisma.Sql[] = [];
    const q = filter.q?.trim();
    if (q) inner.push(Prisma.sql`(u."displayName" ILIKE ${`%${q}%`} OR u.email ILIKE ${`%${q}%`} OR u.phone ILIKE ${`%${q}%`})`);
    if (filter.kind) inner.push(this.kindPredicate(filter.kind));
    if (filter.status) inner.push(Prisma.sql`u."accountStatus"::text = ${filter.status}`);
    const localMidnight = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - TEHRAN_OFFSET_MS);
    if (filter.joinedFrom) inner.push(Prisma.sql`u."createdAt" >= ${localMidnight(filter.joinedFrom)}`);
    if (filter.joinedTo) inner.push(Prisma.sql`u."createdAt" < ${new Date(localMidnight(filter.joinedTo).getTime() + 86_400_000)}`);

    const outer: Prisma.Sql[] = [];
    const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
    if (filter.segment) outer.push(Prisma.sql`x.segment = ${filter.segment}`);
    if (filter.activeWithinDays) outer.push(Prisma.sql`x."engagedAt" >= ${daysAgo(filter.activeWithinDays)}`);
    if (filter.inactiveForDays) outer.push(Prisma.sql`x."engagedAt" < ${daysAgo(filter.inactiveForDays)}`);
    if (filter.minOrders !== undefined) outer.push(Prisma.sql`x."orderCount" >= ${filter.minOrders}`);
    if (filter.minSpend !== undefined) outer.push(Prisma.sql`x."totalSpend" >= ${filter.minSpend}`);
    const has = (flag: boolean | undefined, column: string) => {
      if (flag === undefined) return;
      outer.push(flag ? Prisma.sql`x.${Prisma.raw(`"${column}"`)} > 0` : Prisma.sql`x.${Prisma.raw(`"${column}"`)} = 0`);
    };
    has(filter.hasServiceBooking, "serviceBookingCount");
    has(filter.hasTravelBooking, "travelBookingCount");
    has(filter.hasSupportCases, "supportCaseCount");
    if (filter.hasCancellations !== undefined)
      outer.push(filter.hasCancellations ? Prisma.sql`(x."cancelledCount" + x."noShowCount") > 0` : Prisma.sql`(x."cancelledCount" + x."noShowCount") = 0`);

    const and = (parts: Prisma.Sql[]) => (parts.length ? Prisma.join(parts, " AND ") : Prisma.sql`TRUE`);
    const base = Prisma.sql`
      WITH ${CUSTOMER_METRIC_CTES}
      SELECT x.* FROM (
        SELECT u.id, u."displayName", u.email, u.phone, u."accountStatus", u."createdAt", u."lastActiveAt", ${customerMetricColumns(now)}
        FROM users u ${CUSTOMER_METRIC_JOINS}
        WHERE ${and(inner)}
      ) x WHERE ${and(outer)}`;
    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<Array<DirectoryUser & CustomerMetricRow>>(Prisma.sql`${base} ORDER BY ${USER_ORDER[filter.sort ?? "newest"]} LIMIT ${take} OFFSET ${skip}`),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS total FROM (${base}) c`),
    ]);
    const roles = await this.rolesByUser(rows.map((u) => u.id));
    const items = rows.map((u) => this.row(u, roles.get(u.id) ?? [], u));
    return toPaginatedDto(items, Number(counts[0]?.total ?? 0), page, pageSize);
  }

  async getProfile(userId: string): Promise<AdminUserProfileDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true, email: true, phone: true, accountStatus: true, createdAt: true, lastActiveAt: true } });
    if (!user) throw new AdminCustomerNotFoundException({ userId });

    const [roles, customer, providerReviews, productReviews, travelReviews, audit] = await Promise.all([
      this.rolesByUser([userId]),
      this.customers.getCustomer360(userId),
      this.prisma.providerReview.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, providerOrganizationId: true, rating: true, status: true, createdAt: true } }),
      this.prisma.productReview.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, productId: true, rating: true, status: true, createdAt: true } }),
      this.prisma.travelReview.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, listingId: true, overall: true, status: true, createdAt: true } }),
      this.prisma.adminAuditLog.findMany({
        where: { entityType: { in: ["USER", "User"] }, entityId: userId },
        include: { adminUser: { include: { user: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);
    const userRoles = roles.get(userId) ?? [];
    const businessMap = new Map<string, AdminUserBusinessDto>();
    for (const role of userRoles) {
      if (role.business && role.kind !== "ADMIN_INTERNAL" && role.kind !== "CUSTOMER") {
        businessMap.set(`${role.kind}:${role.business.id}`, { ...role.business, kind: role.kind });
      }
    }
    const reviews: AdminUserReviewSummaryDto[] = [
      ...providerReviews.map((review) => ({ id: review.id, kind: "PROVIDER" as const, targetId: review.providerOrganizationId, rating: review.rating, status: review.status, createdAt: review.createdAt.toISOString() })),
      ...productReviews.map((review) => ({ id: review.id, kind: "PRODUCT" as const, targetId: review.productId, rating: review.rating, status: review.status, createdAt: review.createdAt.toISOString() })),
      ...travelReviews.map((review) => ({ id: review.id, kind: "TRAVEL" as const, targetId: review.listingId, rating: review.overall, status: review.status, createdAt: review.createdAt.toISOString() })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);

    return {
      user: this.row(user, userRoles),
      households: customer.households,
      businesses: [...businessMap.values()],
      orders: customer.recentOrders,
      requests: customer.recentBookings,
      tickets: customer.supportCases,
      reviews,
      auditTrail: audit.map((entry) => ({
        id: entry.id,
        adminUser: { id: entry.adminUser.id, displayName: entry.adminUser.user.displayName, role: entry.adminUser.role as never },
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        reason: entry.reason,
        beforeSummary: entry.beforeSummary as Record<string, unknown> | null,
        afterSummary: entry.afterSummary as Record<string, unknown> | null,
        requestId: entry.requestId,
        createdAt: entry.createdAt.toISOString(),
      })),
      householdCount: customer.households.length,
      petCount: customer.households.reduce((total, household) => total + household.pets.length, 0),
    };
  }

  /**
   * Everything one person has done, newest first, plus the same roll-up the directory filters on. Sign-ins
   * carry only a coarse device class — never the IP address or the raw user agent.
   */
  async getBehavior(userId: string, now = new Date()): Promise<AdminUserBehaviorDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, createdAt: true } });
    if (!user) throw new AdminCustomerNotFoundException({ userId });
    const firstMonthWall = (() => {
      const wall = new Date(now.getTime() + TEHRAN_OFFSET_MS);
      return Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() - 11, 1);
    })();
    const sinceUtc = new Date(firstMonthWall - TEHRAN_OFFSET_MS);
    const month = (column: Prisma.Sql) => Prisma.sql`to_char(date_trunc('month', ${column} + interval '3 hours 30 minutes'), 'YYYY-MM-DD')`;
    const [metrics, monthlyRows, categories, orders, bookings, stays, cases, sessions, providerReviews, productReviews, travelReviews] = await Promise.all([
      this.prisma.$queryRaw<CustomerMetricRow[]>(Prisma.sql`
        WITH ${CUSTOMER_METRIC_CTES}
        SELECT ${customerMetricColumns(now)} FROM users u ${CUSTOMER_METRIC_JOINS} WHERE u.id = ${userId}::uuid`),
      this.prisma.$queryRaw<{ month: string; orders: bigint; bookings: bigint; spend: bigint | null }[]>(Prisma.sql`
        SELECT month, SUM(orders)::bigint AS orders, SUM(bookings)::bigint AS bookings, SUM(spend)::bigint AS spend FROM (
          SELECT ${month(Prisma.sql`o."createdAt"`)} AS month, COUNT(*) AS orders, 0 AS bookings, SUM(o."totalAmount") AS spend
            FROM orders o WHERE o."userId" = ${userId}::uuid AND o."checkoutId" IS NOT NULL AND o.status::text NOT IN ('CANCELLED', 'REFUNDED') AND o."createdAt" >= ${sinceUtc} GROUP BY 1
          UNION ALL
          SELECT ${month(Prisma.sql`b."createdAt"`)}, 0, COUNT(*), SUM(COALESCE(b."priceAmount", 0) - b."discountAmount")::bigint
            FROM bookings b WHERE b."userId" = ${userId}::uuid AND b."bookingStatus"::text IN ('CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW') AND b."createdAt" >= ${sinceUtc} GROUP BY 1
          UNION ALL
          SELECT ${month(Prisma.sql`t."createdAt"`)}, 0, COUNT(*), SUM(t."totalAmountIrr")
            FROM travel_bookings t WHERE t."bookedByUserId" = ${userId}::uuid AND t.status::text IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW') AND t."createdAt" >= ${sinceUtc} GROUP BY 1
        ) m GROUP BY month`),
      this.prisma.$queryRaw<{ key: string; c: bigint; amount: Prisma.Decimal | null }[]>(Prisma.sql`
        SELECT b.category::text AS key, COUNT(*) AS c, SUM(COALESCE(b."priceAmount", 0) - b."discountAmount") AS amount
        FROM bookings b WHERE b."userId" = ${userId}::uuid AND b."bookingStatus"::text IN ('CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW')
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8`),
      this.prisma.order.findMany({ where: { userId, checkoutId: { not: null } }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, createdAt: true, status: true, totalAmount: true, currency: true } }),
      this.prisma.booking.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, createdAt: true, bookingStatus: true, category: true, priceAmount: true, discountAmount: true, currency: true } }),
      this.prisma.travelBooking.findMany({ where: { bookedByUserId: userId, status: { not: "DRAFT" } }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, createdAt: true, status: true, reference: true, totalAmountIrr: true } }),
      this.prisma.supportCase.findMany({ where: { requesterUserId: userId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, createdAt: true, status: true, caseNumber: true } }),
      this.prisma.session.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, createdAt: true, userAgent: true, revokedAt: true } }),
      this.prisma.providerReview.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, createdAt: true, rating: true, status: true } }),
      this.prisma.productReview.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, createdAt: true, rating: true, status: true } }),
      this.prisma.travelReview.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, createdAt: true, overall: true, status: true } }),
    ]);
    const device = (agent: string | null) => (!agent ? null : /Mobi|Android|iPhone|iPad/i.test(agent) ? "mobile" : "desktop");
    const timeline: AdminUserTimelineEntryDto[] = [
      { id: `signup-${user.id}`, kind: "SIGN_UP" as const, at: user.createdAt.toISOString(), status: null, amount: null, label: null, href: null },
      ...orders.map((o) => ({ id: o.id, kind: "ORDER" as const, at: o.createdAt.toISOString(), status: o.status, amount: o.currency === "IRR" ? o.totalAmount : null, label: null, href: `/commerce/orders/${o.id}` })),
      ...bookings.map((b) => ({ id: b.id, kind: "SERVICE_BOOKING" as const, at: b.createdAt.toISOString(), status: b.bookingStatus, amount: b.priceAmount && (b.currency ?? "IRR") === "IRR" ? Math.round(Number(b.priceAmount) - Number(b.discountAmount)) : null, label: b.category, href: `/services/bookings/${b.id}` })),
      ...stays.map((t) => ({ id: t.id, kind: "TRAVEL_BOOKING" as const, at: t.createdAt.toISOString(), status: t.status, amount: t.totalAmountIrr, label: t.reference, href: `/travel/bookings/${t.id}` })),
      ...cases.map((c) => ({ id: c.id, kind: "SUPPORT_CASE" as const, at: c.createdAt.toISOString(), status: c.status, amount: null, label: c.caseNumber, href: `/support/${c.id}` })),
      ...sessions.map((x) => ({ id: x.id, kind: "SIGN_IN" as const, at: x.createdAt.toISOString(), status: x.revokedAt ? "REVOKED" : null, amount: null, label: device(x.userAgent), href: null })),
      ...providerReviews.map((r) => ({ id: r.id, kind: "REVIEW" as const, at: r.createdAt.toISOString(), status: r.status, amount: r.rating, label: "PROVIDER", href: "/services/reviews" })),
      ...productReviews.map((r) => ({ id: r.id, kind: "REVIEW" as const, at: r.createdAt.toISOString(), status: r.status, amount: r.rating, label: "PRODUCT", href: "/commerce/reviews" })),
      ...travelReviews.map((r) => ({ id: r.id, kind: "REVIEW" as const, at: r.createdAt.toISOString(), status: r.status, amount: r.overall, label: "TRAVEL", href: "/travel/reviews" })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 120);

    const byMonth = new Map(monthlyRows.map((r) => [r.month, r]));
    const monthlyActivity = Array.from({ length: 12 }, (_, i) => {
      const key = new Date(Date.UTC(new Date(firstMonthWall).getUTCFullYear(), new Date(firstMonthWall).getUTCMonth() + i, 1)).toISOString().slice(0, 10);
      const r = byMonth.get(key);
      return { month: key, orders: Number(r?.orders ?? 0), bookings: Number(r?.bookings ?? 0), spend: Number(r?.spend ?? 0) };
    });
    const summary = metrics[0]
      ? this.behavior(metrics[0])
      : { orderCount: 0, totalSpend: 0, lastOrderAt: null, serviceBookingCount: 0, travelBookingCount: 0, lastBookingAt: null, cancelledCount: 0, noShowCount: 0, supportCaseCount: 0, segment: "NEVER_PURCHASED" as const };
    return {
      summary,
      monthlyActivity,
      favoriteCategories: categories.map((c) => ({ key: c.key, count: Number(c.c), amount: Math.round(Number(c.amount ?? 0)) })),
      timeline,
    };
  }

  /** Staff messages deliberately share the same audited, preference-aware pipeline as all automated notices. */
  async sendMessage(
    admin: ResolvedAdminContext,
    userId: string,
    input: { title: string; message: string; attemptSms?: boolean },
    requestId?: string,
  ): Promise<{ notificationId: string; smsRequested: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new AdminCustomerNotFoundException({ userId });
    const title = input.title.trim();
    const message = input.message.trim();
    const smsRequested = input.attemptSms !== false;
    const { notification } = await this.notifications.notify({
      userId,
      type: "admin.message",
      category: NotificationCategory.SYSTEM,
      templateParams: { title, body: message, smsBody: message },
      deepLink: "/notifications",
      entityType: "USER",
      entityId: userId,
      actorType: "ADMIN",
      actorId: admin.userId,
      metadata: { source: "admin_user_message" },
      attemptSms: smsRequested,
    });
    await this.audit.record({
      adminUserId: admin.adminUserId,
      action: "user.message_sent",
      entityType: "USER",
      entityId: userId,
      afterSummary: { notificationId: notification.id, smsRequested },
      requestId,
    });
    return { notificationId: notification.id, smsRequested };
  }
}
