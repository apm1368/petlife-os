import { Injectable } from "@nestjs/common";
import { Prisma, ProviderType } from "@prisma/client";
import type {
  AdminUserDirectoryListDto,
  AdminUserDirectoryRowDto,
  AdminUserProfileDto,
  AdminUserRoleDto,
  AdminUserRoleKind,
} from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AdminCustomerNotFoundException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { maskPhone } from "../../../common/phone/phone-normalizer";
import { maskEmail } from "../../../common/pii/pii-mask.util";

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

/**
 * W2-5. One row per person across every source of a platform relationship — internal admins,
 * customers (a household membership), provider staff (clinic / groomer / host / other), shop staff,
 * insurers and NGO members. A person who wears several hats is one row with several roles.
 *
 * The directory is deliberately a thin aggregation: it never re-derives the deep per-domain data the
 * Customer 360 (`/admin/customers/:id/overview`) already composes. Paginating lives on `User`, and the
 * six membership sources are read only for the one page of user ids — so one list call is a count, a
 * user page, and six small `where userId in (…page…)` lookups, never a six-way join across the platform.
 *
 * Two of the six sources (insurer and NGO memberships) store `userId` without a Prisma relation, by the
 * same actor-reference convention they were written with, so they are queried by id list rather than
 * `include`d from User.
 */
@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  private row(user: { id: string; displayName: string; email: string | null; phone: string | null; accountStatus: string; createdAt: Date; lastActiveAt: Date | null }, roles: AdminUserRoleDto[]): AdminUserDirectoryRowDto {
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

  /** The set of user ids that hold at least one relationship of `kind` — used only when a kind filter is applied. */
  private async userIdsForKind(kind: AdminUserRoleKind): Promise<string[]> {
    const distinct = <T extends { userId: string }>(rows: T[]) => [...new Set(rows.map((r) => r.userId))];
    switch (kind) {
      case "ADMIN_INTERNAL":
        return distinct(await this.prisma.adminUser.findMany({ select: { userId: true } }));
      case "CUSTOMER":
        return distinct(await this.prisma.householdMember.findMany({ select: { userId: true } }));
      case "SHOP":
        return distinct(await this.prisma.sellerMembership.findMany({ where: { status: "ACTIVE" }, select: { userId: true } }));
      case "INSURER":
        return distinct(await this.prisma.insurerMembership.findMany({ where: { isActive: true }, select: { userId: true } }));
      case "NGO":
        return distinct(await this.prisma.animalSupportOrgMembership.findMany({ where: { isActive: true }, select: { userId: true } }));
      case "CLINIC":
      case "GROOMER":
      case "HOST":
      case "PROVIDER_OTHER": {
        const types = (Object.values(ProviderType) as ProviderType[]).filter((t) => providerKind(t) === kind);
        return distinct(await this.prisma.providerUser.findMany({ where: { removedAt: null, providerOrganization: { type: { in: types } } }, select: { userId: true } }));
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
    if (filter.kind) {
      where.id = { in: await this.userIdsForKind(filter.kind) };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, select: { id: true, displayName: true, email: true, phone: true, accountStatus: true, createdAt: true, lastActiveAt: true } }),
      this.prisma.user.count({ where }),
    ]);

    const roles = await this.rolesByUser(users.map((u) => u.id));
    const items = users.map((u) => this.row(u, roles.get(u.id) ?? []));
    return toPaginatedDto(items, total, page, pageSize);
  }

  async getProfile(userId: string): Promise<AdminUserProfileDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true, email: true, phone: true, accountStatus: true, createdAt: true, lastActiveAt: true } });
    if (!user) throw new AdminCustomerNotFoundException({ userId });

    const [roles, households, petCount] = await Promise.all([
      this.rolesByUser([userId]),
      this.prisma.householdMember.findMany({ where: { userId }, select: { householdId: true } }),
      this.prisma.pet.count({ where: { household: { members: { some: { userId } } }, deletedAt: null } }),
    ]);

    return {
      user: this.row(user, roles.get(userId) ?? []),
      householdCount: new Set(households.map((h) => h.householdId)).size,
      petCount,
    };
  }
}
