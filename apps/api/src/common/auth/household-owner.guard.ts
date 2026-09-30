import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { HouseholdRole, type HouseholdMember } from "@prisma/client";
import { HouseholdAccessDeniedException } from "../errors/api-exception";

/**
 * Batch 8 — for household actions that only an owner may take (buying,
 * changing or cancelling the household's membership, reading its billing).
 * Always runs after HouseholdMemberGuard, which resolves the membership.
 */
@Injectable()
export class HouseholdOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ householdMembership?: HouseholdMember; params: Record<string, string> }>();
    if (request.householdMembership?.role !== HouseholdRole.OWNER) throw new HouseholdAccessDeniedException({ householdId: request.params.householdId ?? request.params.id, requiredRole: "OWNER" });
    return true;
  }
}
