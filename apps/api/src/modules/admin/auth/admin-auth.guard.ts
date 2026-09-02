import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UnauthenticatedException, AdminAccessDeniedException } from "../../../common/errors/api-exception";
import { AdminAccessService } from "./admin-access.service";
import { roleHasPermission, type AdminPermission } from "./admin-permissions";
import { ADMIN_PERMISSION_KEY } from "./require-admin-permission.decorator";
import type { AdminAuthedRequest } from "./admin-context.types";

/**
 * Every /admin route goes through this guard. It requires the same
 * HTTP-only session cookie SessionAuthGuard reads (so AdminAuthGuard must
 * run after it in a route's guard order — see AdminModule), then resolves
 * an explicit AdminUser row for that session's userId; a valid consumer
 * session with no AdminUser row is rejected exactly like an anonymous
 * caller would be for a seller/provider route. When a handler declares
 * @RequireAdminPermission, the resolved role must satisfy at least one of
 * the listed permissions.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly adminAccess: AdminAccessService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminAuthedRequest>();
    const user = request.user;
    if (!user) throw new UnauthenticatedException();

    const resolved = await this.adminAccess.resolveAdminContext(user.id);

    const requiredPermissions = this.reflector.get<AdminPermission[] | undefined>(ADMIN_PERMISSION_KEY, context.getHandler());
    if (requiredPermissions && requiredPermissions.length > 0) {
      const satisfied = requiredPermissions.some((permission) => roleHasPermission(resolved.role, permission));
      if (!satisfied) {
        throw new AdminAccessDeniedException({ reason: "INSUFFICIENT_PERMISSION", requiredPermissions, role: resolved.role });
      }
    }

    request.adminContext = resolved;
    return true;
  }
}
