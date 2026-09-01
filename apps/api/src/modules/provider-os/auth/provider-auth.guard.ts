import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ProviderUserRole } from "@prisma/client";
import { UnauthenticatedException, ProviderAccessDeniedException } from "../../../common/errors/api-exception";
import { ProviderContextService } from "../provider-context.service";
import { PROVIDER_ROLE_KEY } from "./require-provider-role.decorator";
import type { ProviderAuthedRequest } from "./provider-context.types";

/**
 * Every Provider OS route goes through this guard — it resolves the caller's
 * active provider organization (throwing PROVIDER_ACCESS_DENIED if none can
 * be confidently resolved) and, when a handler declares @RequireProviderRole,
 * checks the caller's role in that organization. Deliberately separate from
 * PetAccessGuard: provider role is never a pet-data permission source (see
 * the doc comment on ProviderUserRole in schema.prisma) — this guard never
 * touches PetAccessGrant at all.
 */
@Injectable()
export class ProviderAuthGuard implements CanActivate {
  constructor(
    private readonly providerContext: ProviderContextService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ProviderAuthedRequest>();
    const user = request.user;
    if (!user) throw new UnauthenticatedException();

    const resolved = await this.providerContext.resolveActiveMembership(user.id);

    const requiredRoles = this.reflector.get<ProviderUserRole[] | undefined>(PROVIDER_ROLE_KEY, context.getHandler());
    if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(resolved.role)) {
      throw new ProviderAccessDeniedException({ reason: "INSUFFICIENT_ROLE", requiredRoles, actualRole: resolved.role });
    }

    request.providerContext = resolved;
    return true;
  }
}
