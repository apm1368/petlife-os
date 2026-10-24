import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AnimalSupportOrgRole } from "@prisma/client";
import type { AuthedRequest } from "../../common/auth/current-user.decorator";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { NgoContext } from "./ngo-portal.service";

export const NGO_ROLES_KEY = "ngoRoles";
/** Restricts a portal route to some organization roles (default: any active member). */
export const RequireNgoRole = (...roles: AnimalSupportOrgRole[]) => SetMetadata(NGO_ROLES_KEY, roles);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the caller's organization. `x-ngo-organization` (or `?org=`) only selects among the
 * caller's own active memberships; without it the first membership is used. Anything else is 403.
 */
@Injectable()
export class NgoAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest & { ngoContext?: NgoContext; query: Record<string, string | undefined>; headers: Record<string, string | string[] | undefined> }>();
    if (!req.user) return false;
    const header = req.headers["x-ngo-organization"];
    const requested = (Array.isArray(header) ? header[0] : header) ?? req.query.org;
    if (requested && !UUID.test(requested)) throw new ForbiddenException({ error: { code: "NGO_ACCESS_DENIED", message: "You are not a member of this organization." } });
    const membership = await this.prisma.animalSupportOrgMembership.findFirst({
      where: { userId: req.user.id, isActive: true, ...(requested ? { organizationId: requested } : {}) },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) throw new ForbiddenException({ error: { code: "NGO_ACCESS_DENIED", message: "You are not a member of this organization." } });
    const roles = this.reflector.getAllAndOverride<AnimalSupportOrgRole[] | undefined>(NGO_ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (roles?.length && !roles.includes(membership.role)) throw new ForbiddenException({ error: { code: "NGO_ROLE_REQUIRED", message: "Your role in this organization cannot do this." } });
    req.ngoContext = { organizationId: membership.organizationId, role: membership.role };
    return true;
  }
}
