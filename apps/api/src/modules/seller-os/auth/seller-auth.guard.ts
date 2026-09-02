import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SellerMembershipRole } from "@prisma/client";
import { UnauthenticatedException, SellerAccessDeniedException } from "../../../common/errors/api-exception";
import { SellerAccessService } from "../seller-access.service";
import { SELLER_ROLE_KEY } from "./require-seller-role.decorator";
import type { SellerAuthedRequest } from "./seller-context.types";

/** OWNER/ADMIN always satisfy any role requirement (spec section 4) — see RequireSellerRole's doc comment. */
function roleSatisfies(actualRole: SellerMembershipRole, requiredRoles: SellerMembershipRole[]): boolean {
  if (actualRole === SellerMembershipRole.OWNER || actualRole === SellerMembershipRole.ADMIN) return true;
  return requiredRoles.includes(actualRole);
}

/**
 * Every Seller OS route goes through this guard — it reads `:sellerId` from
 * the route (never an implicit "active organization", see
 * ResolvedSellerContext's doc comment), resolves the caller's membership in
 * that exact organization (throwing SELLER_ACCESS_DENIED if none exists, is
 * not ACTIVE, or the organization itself is not usable) and, when a handler
 * declares @RequireSellerRole, checks the caller's role. This is the
 * replacement for Handoff 08's temporary "authenticated user owns the
 * checkout/order" stand-in for seller operations (spec section 39).
 */
@Injectable()
export class SellerAuthGuard implements CanActivate {
  constructor(
    private readonly sellerAccess: SellerAccessService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SellerAuthedRequest>();
    const user = request.user;
    if (!user) throw new UnauthenticatedException();

    const sellerId = request.params?.sellerId;
    if (!sellerId || typeof sellerId !== "string") throw new SellerAccessDeniedException({ reason: "MISSING_SELLER_ID" });

    const resolved = await this.sellerAccess.resolveMembership(user.id, sellerId);

    const requiredRoles = this.reflector.get<SellerMembershipRole[] | undefined>(SELLER_ROLE_KEY, context.getHandler());
    if (requiredRoles && requiredRoles.length > 0 && !roleSatisfies(resolved.role, requiredRoles)) {
      throw new SellerAccessDeniedException({ reason: "INSUFFICIENT_ROLE", requiredRoles, actualRole: resolved.role });
    }

    request.sellerContext = resolved;
    return true;
  }
}
