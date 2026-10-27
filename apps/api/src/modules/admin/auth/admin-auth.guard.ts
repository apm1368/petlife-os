import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UnauthenticatedException, AdminAccessDeniedException } from "../../../common/errors/api-exception";
import { AdminAccessService } from "./admin-access.service";
import { roleHasPermission, type AdminPermission } from "./admin-permissions";
import { ADMIN_PERMISSION_KEY } from "./require-admin-permission.decorator";
import { ADMIN_VERTICAL_KEY } from "./require-admin-vertical.decorator";
import { allowedVerticals } from "./admin-verticals";
import type { AdminVertical } from "@prisma/client";
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

    // Second axis: the permission says the role may do this kind of work, the vertical says whether
    // these are its rows. A scoped role that passes the permission check still fails here when the
    // route belongs to someone else's vertical, so narrowing the menu is never what protects a route.
    // Read from the handler first, then the controller: a vertical is normally a property of the
    // whole controller ("everything under /admin/commerce is the shop"), and a single handler may
    // still override it.
    const requiredVerticals = this.reflector.getAllAndOverride<AdminVertical[] | undefined>(ADMIN_VERTICAL_KEY, [context.getHandler(), context.getClass()]);
    if (requiredVerticals && requiredVerticals.length > 0) {
      const allowed = allowedVerticals(resolved);
      if (allowed !== null && !requiredVerticals.some((vertical) => allowed.includes(vertical))) {
        throw new AdminAccessDeniedException({ reason: "OUT_OF_VERTICAL_SCOPE", requiredVerticals, role: resolved.role, scopes: allowed });
      }
    }

    request.adminContext = resolved;
    return true;
  }
}
