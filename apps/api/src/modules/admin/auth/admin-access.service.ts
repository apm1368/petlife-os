import { Injectable } from "@nestjs/common";
import { AdminMembershipStatus, type AdminRole, type AdminVertical } from "@prisma/client";
import type { AdminSessionContextDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AdminAccessDeniedException } from "../../../common/errors/api-exception";
import { ROLE_PERMISSIONS, isAdminPermission, CUSTOM_ROLE_FORBIDDEN, type AdminPermission } from "./admin-permissions";
import type { ResolvedAdminContext } from "./admin-context.types";

/**
 * The single place that turns "an authenticated consumer session's userId"
 * into "an authorized internal-platform identity" — every /admin route goes
 * through this (via AdminAuthGuard), mirroring SellerAccessService's own
 * resolveMembership as the one source of truth for that axis. A consumer
 * session with no AdminUser row, or an AdminUser row that is SUSPENDED,
 * never resolves here — there is no fallback or implicit grant.
 */
const CUSTOM_ROLE_SELECT = { id: true, name: true, permissions: true, verticals: true, archivedAt: true } as const;

/**
 * An assigned, live custom role replaces the built-in role's permissions and verticals. Archived roles cannot be
 * assigned (the service refuses), but a stale row would still fail closed here: an archived role grants nothing.
 * admin.manage is stripped defensively even though the database CHECK already forbids storing it.
 */
export function effectiveAccess(adminUser: {
  role: AdminRole;
  customRole?: { id: string; name: string; permissions: string[]; verticals: AdminVertical[]; archivedAt: Date | null } | null;
}): { permissions: AdminPermission[]; customRole: { id: string; name: string; verticals: AdminVertical[] } | null } {
  const role = adminUser.customRole;
  if (!role) return { permissions: [...ROLE_PERMISSIONS[adminUser.role]], customRole: null };
  if (role.archivedAt) return { permissions: [], customRole: { id: role.id, name: role.name, verticals: role.verticals } };
  const permissions = role.permissions.filter(isAdminPermission).filter((p) => !CUSTOM_ROLE_FORBIDDEN.includes(p));
  return { permissions, customRole: { id: role.id, name: role.name, verticals: role.verticals } };
}

@Injectable()
export class AdminAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveAdminContext(userId: string): Promise<ResolvedAdminContext> {
    const adminUser = await this.prisma.adminUser.findUnique({
      where: { userId },
      include: { user: true, customRole: { select: CUSTOM_ROLE_SELECT } },
    });
    if (!adminUser) throw new AdminAccessDeniedException({ reason: "NOT_AN_ADMIN" });
    if (adminUser.status !== AdminMembershipStatus.ACTIVE) {
      throw new AdminAccessDeniedException({ reason: "ADMIN_SUSPENDED", status: adminUser.status });
    }
    return {
      adminUserId: adminUser.id,
      userId: adminUser.userId,
      displayName: adminUser.user.displayName,
      role: adminUser.role,
      status: adminUser.status,
      serviceScopes: adminUser.serviceScopes,
      ...effectiveAccess(adminUser),
    };
  }

  /** Never throws (mirrors SellerAccessService.getContextDto's own "resolve once, always succeeds" shape) — backs the /admin/me bootstrap call the Admin Shell uses to render a friendly "you are not an admin" state instead of a raw 403. */
  async getSessionContext(userId: string): Promise<AdminSessionContextDto> {
    const adminUser = await this.prisma.adminUser.findUnique({ where: { userId }, include: { user: true, customRole: { select: CUSTOM_ROLE_SELECT } } });
    if (!adminUser || adminUser.status !== AdminMembershipStatus.ACTIVE) {
      return { isAdmin: false, adminUserId: null, displayName: null, role: null, permissions: [] };
    }
    return {
      isAdmin: true,
      adminUserId: adminUser.id,
      displayName: adminUser.user.displayName,
      role: adminUser.role as unknown as AdminSessionContextDto["role"],
      permissions: [...effectiveAccess(adminUser).permissions] as AdminSessionContextDto["permissions"],
      customRoleName: effectiveAccess(adminUser).customRole?.name ?? null,
    };
  }
}
