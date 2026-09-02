import { Injectable } from "@nestjs/common";
import { AdminMembershipStatus } from "@prisma/client";
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
      include: { user: true },
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
    };
  }

  /** Never throws (mirrors SellerAccessService.getContextDto's own "resolve once, always succeeds" shape) — backs the /admin/me bootstrap call the Admin Shell uses to render a friendly "you are not an admin" state instead of a raw 403. */
  async getSessionContext(userId: string): Promise<AdminSessionContextDto> {
    const adminUser = await this.prisma.adminUser.findUnique({ where: { userId }, include: { user: true } });
    if (!adminUser || adminUser.status !== AdminMembershipStatus.ACTIVE) {
      return { isAdmin: false, adminUserId: null, displayName: null, role: null, permissions: [] };
    }
    return {
      isAdmin: true,
      adminUserId: adminUser.id,
      displayName: adminUser.user.displayName,
      role: adminUser.role as unknown as AdminSessionContextDto["role"],
      permissions: ROLE_PERMISSIONS[adminUser.role],
    };
  }
}
