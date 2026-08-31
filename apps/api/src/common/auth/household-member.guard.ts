import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { HouseholdAccessDeniedException } from "../errors/api-exception";
import type { AuthedRequest } from "./current-user.decorator";

/** Guards routes shaped as /households/:id or /households/:householdId/... */
@Injectable()
export class HouseholdMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const householdId = String(request.params.householdId ?? request.params.id ?? "");
    const user = request.user;
    if (!user || !householdId) throw new HouseholdAccessDeniedException();

    const membership = await this.prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId: user.id } },
    });

    if (!membership) throw new HouseholdAccessDeniedException({ householdId });

    (request as AuthedRequest & { householdMembership?: typeof membership }).householdMembership = membership;
    return true;
  }
}
