import { Injectable } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import type { AdminSessionContextDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AdminAccessDeniedException } from "../../../common/errors/api-exception";
import { ROLE_PERMISSIONS } from "./admin-permissions";
import type { ResolvedAdminContext } from "./admin-context.types";

/**
 * The single place that turns "an authenticated consumer session's userId"
 * into "an authorized internal-platform identity" — every /admin route goes
 * through this (via AdminAuthGuard), mirroring SellerAccessService's own
 * resolveMembership as the one source of truth for that axis. A consumer
 * session with no AdminUser row, or an AdminUser row that is SUSPENDED,
 * never resolves here — there is no fallback or implicit grant.
 */
@Injectable()
export class AdminAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveAdminContext(userId: string): Promise<ResolvedAdminContext> {
    const adminUser = await this.prisma.adminUser.findUnique({
      where: { userId },
      include: { user: true, customRole: { select: { id: true, key: true, permissions: true, verticals: true, status: true } } },
    });
    if (!adminUser) throw new AdminAccessDeniedException({ reason: "NOT_AN_ADMIN" });
    if (adminUser.status !== AdminMembershipStatus.ACTIVE) {
      throw new AdminAccessDeniedException({ reason: "ADMIN_SUSPENDED", status: adminUser.status });
    }
    return {
      adminUserId: adminUser.id,
      userId: adminUser.userId,
      displayName: adminUser.user.displayName,
      role: adminUser.customRole?.status === "ACTIVE" ? AdminRole.CUSTOM : adminUser.role,
      status: adminUser.status,
      serviceScopes: adminUser.serviceScopes,
      customRoleId: adminUser.customRole?.status === "ACTIVE" ? adminUser.customRole.id : null,
      customRoleKey: adminUser.customRole?.status === "ACTIVE" ? adminUser.customRole.key : null,
      customPermissions: adminUser.customRole?.status === "ACTIVE" ? adminUser.customRole.permissions : [],
      customRoleVerticals: adminUser.customRole?.status === "ACTIVE" ? adminUser.customRole.verticals : [],
    };
  }

  /** Never throws (mirrors SellerAccessService.getContextDto's own "resolve once, always succeeds" shape) — backs the /admin/me bootstrap call the Admin Shell uses to render a friendly "you are not an admin" state instead of a raw 403. */
  async getSessionContext(userId: string): Promise<AdminSessionContextDto> {
    const adminUser = await this.prisma.adminUser.findUnique({ where: { userId }, include: { user: true, customRole: { select: { permissions: true, status: true } } } });
    if (!adminUser || adminUser.status !== AdminMembershipStatus.ACTIVE) {
      return { isAdmin: false, adminUserId: null, displayName: null, role: null, permissions: [] };
    }
    const role = adminUser.customRole?.status === "ACTIVE" ? AdminRole.CUSTOM : adminUser.role;
    return {
      isAdmin: true,
      adminUserId: adminUser.id,
      displayName: adminUser.user.displayName,
      role: role as unknown as AdminSessionContextDto["role"],
      permissions: [...new Set([
        ...ROLE_PERMISSIONS[role],
        ...(adminUser.customRole?.status === "ACTIVE" ? adminUser.customRole.permissions : []),
      ])] as AdminSessionContextDto["permissions"],
    };
  }
}
