import { Injectable } from "@nestjs/common";
import { Prisma, ProviderType } from "@prisma/client";
import type {
  AdminUserDirectoryListDto,
  AdminUserDirectoryRowDto,
  AdminUserBusinessDto,
  AdminUserProfileDto,
  AdminUserReviewSummaryDto,
  AdminUserRoleDto,
  AdminUserRoleKind,
} from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AdminCustomerNotFoundException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { maskPhone } from "../../../common/phone/phone-normalizer";
import { maskEmail } from "../../../common/pii/pii-mask.util";
import { AdminCustomerService } from "../customer/admin-customer.service";

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

export type UserDirectoryFilter = PaginationQueryDto & { q?: string; kind?: AdminUserRoleKind };
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
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: AdminCustomerService,
  ) {}

  private row(user: DirectoryUser, roles: AdminUserRoleDto[]): AdminUserDirectoryRowDto {
    return {
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

  private async filteredPage(kind: AdminUserRoleKind, q: string | undefined, skip: number, take: number): Promise<{ users: DirectoryUser[]; total: number }> {
    const search = q
      ? Prisma.sql`(u."displayName" ILIKE ${`%${q}%`} OR u.email ILIKE ${`%${q}%`} OR u.phone ILIKE ${`%${q}%`})`
      : Prisma.sql`TRUE`;
    const membership = this.kindPredicate(kind);
    const [users, counts] = await Promise.all([
      this.prisma.$queryRaw<DirectoryUser[]>(Prisma.sql`
        SELECT u.id, u."displayName", u.email, u.phone, u."accountStatus", u."createdAt", u."lastActiveAt"
        FROM users u
        WHERE ${search} AND ${membership}
        ORDER BY u."createdAt" DESC, u.id DESC
        LIMIT ${take} OFFSET ${skip}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total FROM users u WHERE ${search} AND ${membership}
      `),
    ]);
    return { users, total: Number(counts[0]?.total ?? 0) };
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

  async list(filter: UserDirectoryFilter): Promise<AdminUserDirectoryListDto> {
    const { page, pageSize, skip, take } = resolvePagination(filter);
    const where: Prisma.UserWhereInput = {};
    const q = filter.q?.trim();
    if (q) {
      where.OR = [
        { displayName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
      ];
    }
    const result = filter.kind
      ? await this.filteredPage(filter.kind, q, skip, take)
      : await (async () => {
          const [users, total] = await Promise.all([
            this.prisma.user.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take, select: { id: true, displayName: true, email: true, phone: true, accountStatus: true, createdAt: true, lastActiveAt: true } }),
            this.prisma.user.count({ where }),
          ]);
          return { users, total };
        })();
    const { users, total } = result;

    const roles = await this.rolesByUser(users.map((u) => u.id));
    const items = users.map((u) => this.row(u, roles.get(u.id) ?? []));
    return toPaginatedDto(items, total, page, pageSize);
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
}
