import { Injectable } from "@nestjs/common";
import type { Prisma, ProviderOrganization, ProviderUser } from "@prisma/client";
import type { ProviderContextDto, ProviderMembershipSummaryDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { ProviderAccessDeniedException } from "../../common/errors/api-exception";
import type { ResolvedProviderContext } from "./auth/provider-context.types";

type MembershipWithOrg = ProviderUser & { providerOrganization: ProviderOrganization };

function toSummary(membership: MembershipWithOrg): ProviderMembershipSummaryDto {
  return {
    providerUserId: membership.id,
    providerOrganizationId: membership.providerOrganizationId,
    organizationName: membership.providerOrganization.name,
    organizationType: membership.providerOrganization.type as unknown as ProviderMembershipSummaryDto["organizationType"],
    verificationStatus: membership.providerOrganization.verificationStatus as unknown as ProviderMembershipSummaryDto["verificationStatus"],
    role: membership.role as unknown as ProviderMembershipSummaryDto["role"],
  };
}

function toResolvedContext(membership: MembershipWithOrg, userId: string): ResolvedProviderContext {
  return {
    providerUserId: membership.id,
    userId,
    role: membership.role,
    displayTitle: membership.displayTitle,
    organizationId: membership.providerOrganizationId,
    organizationName: membership.providerOrganization.name,
    verificationStatus: membership.providerOrganization.verificationStatus,
  };
}

/**
 * The Provider OS equivalent of ActivePetService — resolves which provider
 * organization a signed-in user is currently operating in. A user with
 * exactly one ProviderUser membership never needs to choose explicitly; a
 * user with more than one must (spec section 3: "do not infer organization
 * implicitly when multiple exist") — see resolveActiveMembership.
 */
@Injectable()
export class ProviderContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  private async listMemberships(userId: string, client: PrismaService | Prisma.TransactionClient = this.prisma): Promise<MembershipWithOrg[]> {
    return client.providerUser.findMany({ where: { userId }, include: { providerOrganization: true } });
  }

  /**
   * Used by ProviderAuthGuard — throws whenever no single organization can
   * be confidently resolved, rather than guessing. Read-only endpoints that
   * must work even before a choice exists (GET .../context) call
   * getContextDto instead, which never throws.
   */
  async resolveActiveMembership(userId: string): Promise<ResolvedProviderContext> {
    const memberships = await this.listMemberships(userId);
    if (memberships.length === 0) {
      throw new ProviderAccessDeniedException({ reason: "NOT_A_PROVIDER" });
    }
    if (memberships.length === 1) {
      return toResolvedContext(memberships[0]!, userId);
    }

    const preference = await this.prisma.providerContextPreference.findUnique({ where: { userId } });
    const match = preference && memberships.find((m) => m.providerOrganizationId === preference.providerOrganizationId);
    if (match) return toResolvedContext(match, userId);

    throw new ProviderAccessDeniedException({
      reason: "AMBIGUOUS_CONTEXT",
      availableOrganizations: memberships.map(toSummary),
    });
  }

  /** Never throws — lets the Provider Shell render an organization picker when there is no resolvable active org. */
  async getContextDto(userId: string): Promise<ProviderContextDto> {
    const memberships = await this.listMemberships(userId);
    if (memberships.length === 0) return { active: null, memberships: [] };
    if (memberships.length === 1) return { active: toSummary(memberships[0]!), memberships: memberships.map(toSummary) };

    const preference = await this.prisma.providerContextPreference.findUnique({ where: { userId } });
    const match = preference && memberships.find((m) => m.providerOrganizationId === preference.providerOrganizationId);
    return { active: match ? toSummary(match) : null, memberships: memberships.map(toSummary) };
  }

  async setContext(userId: string, providerOrganizationId: string): Promise<ProviderContextDto> {
    const membership = await this.prisma.providerUser.findFirst({ where: { userId, providerOrganizationId } });
    if (!membership) throw new ProviderAccessDeniedException({ providerOrganizationId, reason: "CROSS_ORGANIZATION" });

    await this.prisma.$transaction(async (tx) => {
      await tx.providerContextPreference.upsert({
        where: { userId },
        update: { providerOrganizationId },
        create: { userId, providerOrganizationId },
      });
      await this.events.publish(
        "ProviderContextChanged",
        { userId, providerOrganizationId },
        { tx, aggregateType: "ProviderOrganization", aggregateId: providerOrganizationId },
      );
    });

    return this.getContextDto(userId);
  }
}
