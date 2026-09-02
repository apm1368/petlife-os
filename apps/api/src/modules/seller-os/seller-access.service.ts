import { Injectable } from "@nestjs/common";
import { SellerMembershipRole, SellerMembershipStatus, SellerStatus, type Prisma, type SellerMembership, type SellerOrganization } from "@prisma/client";
import type { SellerContextDto, SellerMembershipSummaryDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { SellerAccessDeniedException } from "../../common/errors/api-exception";
import type { ResolvedSellerContext } from "./auth/seller-context.types";

type MembershipWithOrg = SellerMembership & { sellerOrganization: SellerOrganization };

/** Operational lifecycle states that never block a mutating seller action — everything else (SUSPENDED/RESTRICTED/CLOSED) does. */
const OPERATIONAL_SELLER_STATUSES: SellerStatus[] = [SellerStatus.PENDING, SellerStatus.ACTIVE];

function toSummary(membership: MembershipWithOrg): SellerMembershipSummaryDto {
  return {
    sellerMembershipId: membership.id,
    sellerOrganizationId: membership.sellerOrganizationId,
    organizationName: membership.sellerOrganization.name,
    verificationStatus: membership.sellerOrganization.verificationStatus as unknown as SellerMembershipSummaryDto["verificationStatus"],
    sellerStatus: membership.sellerOrganization.status as unknown as SellerMembershipSummaryDto["sellerStatus"],
    role: membership.role as unknown as SellerMembershipSummaryDto["role"],
  };
}

function toResolvedContext(membership: MembershipWithOrg): ResolvedSellerContext {
  return {
    sellerMembershipId: membership.id,
    userId: membership.userId,
    role: membership.role,
    sellerOrganizationId: membership.sellerOrganizationId,
    sellerOrganizationName: membership.sellerOrganization.name,
    sellerStatus: membership.sellerOrganization.status,
    verificationStatus: membership.sellerOrganization.verificationStatus,
  };
}

/**
 * The Seller OS authorization core (spec section 4) — every seller-scoped
 * request resolves through `resolveMembership`, which always checks the
 * exact `:sellerId` from the route (see SellerAuthGuard), never an implicit
 * "current" organization. `assertOperational` is the separate, explicit
 * check mutating actions call (spec section 74: suspension blocks new
 * operational actions, but reads still work) — deliberately not folded into
 * the guard itself, mirroring how ProviderOrgNotVerifiedException is a
 * service-level check in Provider OS rather than a guard-level one.
 */
@Injectable()
export class SellerAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async resolveMembership(userId: string, sellerOrganizationId: string): Promise<ResolvedSellerContext> {
    const membership = await this.prisma.sellerMembership.findUnique({
      where: { sellerOrganizationId_userId: { sellerOrganizationId, userId } },
      include: { sellerOrganization: true },
    });
    if (!membership) throw new SellerAccessDeniedException({ reason: "NOT_A_MEMBER", sellerOrganizationId });
    if (membership.status !== SellerMembershipStatus.ACTIVE) {
      throw new SellerAccessDeniedException({ reason: "MEMBERSHIP_INACTIVE", sellerOrganizationId, status: membership.status });
    }
    return toResolvedContext(membership);
  }

  /** Called by mutating seller actions only (offer/inventory/listing/fulfillment writes) — never by a read. */
  assertOperational(sellerStatus: SellerStatus, details?: Record<string, unknown>): void {
    if (!OPERATIONAL_SELLER_STATUSES.includes(sellerStatus)) {
      throw new SellerAccessDeniedException({ reason: "SELLER_SUSPENDED", sellerStatus, ...details });
    }
  }

  private async listMemberships(userId: string, client: PrismaService | Prisma.TransactionClient = this.prisma): Promise<MembershipWithOrg[]> {
    return client.sellerMembership.findMany({ where: { userId, status: SellerMembershipStatus.ACTIVE }, include: { sellerOrganization: true }, orderBy: { createdAt: "asc" } });
  }

  /** Never throws — lets the Seller Shell render an organization picker when there is no resolvable active seller yet. */
  async getContextDto(userId: string): Promise<SellerContextDto> {
    const memberships = await this.listMemberships(userId);
    if (memberships.length === 0) return { active: null, memberships: [] };
    if (memberships.length === 1) return { active: toSummary(memberships[0]!), memberships: memberships.map(toSummary) };

    const preference = await this.prisma.sellerContextPreference.findUnique({ where: { userId } });
    const match = preference && memberships.find((m) => m.sellerOrganizationId === preference.sellerOrganizationId);
    return { active: match ? toSummary(match) : null, memberships: memberships.map(toSummary) };
  }

  /** Frontend convenience only (spec section 5) — never consulted for authorization, which always re-checks the route's own `:sellerId`. */
  async setContext(userId: string, sellerOrganizationId: string): Promise<SellerContextDto> {
    await this.resolveMembership(userId, sellerOrganizationId);

    await this.prisma.$transaction(async (tx) => {
      await tx.sellerContextPreference.upsert({
        where: { userId },
        update: { sellerOrganizationId },
        create: { userId, sellerOrganizationId },
      });
      await this.events.publish("SellerContextChanged", { userId, sellerOrganizationId }, { tx, aggregateType: "SellerOrganization", aggregateId: sellerOrganizationId });
    });

    return this.getContextDto(userId);
  }

  /** Used by SellerTeamService's "cannot remove/demote the last active OWNER" guard (spec section 48). */
  async countActiveOwners(sellerOrganizationId: string, excludeMembershipId?: string): Promise<number> {
    return this.prisma.sellerMembership.count({
      where: {
        sellerOrganizationId,
        role: SellerMembershipRole.OWNER,
        status: SellerMembershipStatus.ACTIVE,
        ...(excludeMembershipId ? { id: { not: excludeMembershipId } } : {}),
      },
    });
  }
}
