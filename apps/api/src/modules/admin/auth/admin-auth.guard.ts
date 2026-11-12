import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UnauthenticatedException, AdminAccessDeniedException } from "../../../common/errors/api-exception";
import { AdminAccessService } from "./admin-access.service";
import { adminCan, type AdminPermission } from "./admin-permissions";
import { ADMIN_PERMISSION_KEY } from "./require-admin-permission.decorator";
import { ADMIN_VERTICAL_KEY } from "./require-admin-vertical.decorator";
import { allowedVerticals } from "./admin-verticals";
import type { AdminVertical } from "@prisma/client";
import type { AdminAuthedRequest } from "./admin-context.types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { SessionService } from "../../../common/session/session.service";
import { ADMIN_TWO_STEP_EXEMPT_KEY, AdminTwoStepRequiredException, evaluateTwoStep } from "../two-step/two-step-gate";

/**
 * Every /admin route goes through this guard. It requires the same
 * HTTP-only session cookie SessionAuthGuard reads (so AdminAuthGuard must
 * run after it in a route's guard order — see AdminModule), then resolves
 * an explicit AdminUser row for that session's userId; a valid consumer
 * session with no AdminUser row is rejected exactly like an anonymous
 * caller would be for a seller/provider route. When a handler declares
 * @RequireAdminPermission, the resolved role must satisfy at least one of
 * the listed permissions.
 *
 * Between the two: two-step sign-in (admin/two-step). An admin with an authenticator must have passed it in this
 * session; while a SUPER_ADMIN enforces it, an admin without one must enrol once their grace window ends. Only the
 * handlers marked @AllowBeforeTwoStep (status, enrol, verify) answer before that.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly adminAccess: AdminAccessService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminAuthedRequest>();
    const user = request.user;
    if (!user) throw new UnauthenticatedException();

    const resolved = await this.adminAccess.resolveAdminContext(user.id);

    const exempt = this.reflector.getAllAndOverride<boolean | undefined>(ADMIN_TWO_STEP_EXEMPT_KEY, [context.getHandler(), context.getClass()]);
    if (!exempt) {
      const gate = await evaluateTwoStep(this.prisma, user.id, this.sessions.getSessionId(this.sessions.readCookie(request)));
      if (gate.required !== "NONE") throw new AdminTwoStepRequiredException({ reason: gate.required, graceEndsAt: gate.graceEndsAt?.toISOString() ?? null });
    }

    const requiredPermissions = this.reflector.getAllAndOverride<AdminPermission[] | undefined>(ADMIN_PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (requiredPermissions && requiredPermissions.length > 0) {
      const satisfied = requiredPermissions.some((permission) => adminCan(resolved, permission));
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
