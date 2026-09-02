import { Injectable } from "@nestjs/common";
import { SellerMembershipRole, SellerMembershipStatus } from "@prisma/client";
import type { SellerTeamMemberDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException, SellerLastOwnerException, SellerMembershipNotFoundException } from "../../common/errors/api-exception";
import { SellerAccessService } from "./seller-access.service";
import type { ResolvedSellerContext } from "./auth/seller-context.types";

function toDto(m: { id: string; user: { displayName: string }; role: SellerMembershipRole; status: SellerMembershipStatus; invitedAt: Date; acceptedAt: Date | null; createdAt: Date; userId: string }): SellerTeamMemberDto {
  return {
    sellerMembershipId: m.id,
    userId: m.userId,
    displayName: m.user.displayName,
    role: m.role as unknown as SellerTeamMemberDto["role"],
    status: m.status as unknown as SellerTeamMemberDto["status"],
    invitedAt: m.invitedAt.toISOString(),
    acceptedAt: m.acceptedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

/**
 * Seller Team management (spec section 4, 48) — replaces the read-only
 * roster ProviderTeamService (Handoff 05) was for Provider OS with real
 * invite/role-change/remove, since Seller OS is the first place PET LIFE OS
 * needs real multi-person team authorization. "Acceptable to create a
 * dev/local invite flow" (spec section 48): inviting requires an existing
 * PET LIFE OS user (looked up by email/phone) and the membership is ACTIVE
 * immediately — no email/SMS delivery exists to drive a real PENDING/accept
 * flow (see README Known limitations).
 */
@Injectable()
export class SellerTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly sellerAccess: SellerAccessService,
  ) {}

  async list(ctx: ResolvedSellerContext): Promise<SellerTeamMemberDto[]> {
    const members = await this.prisma.sellerMembership.findMany({
      where: { sellerOrganizationId: ctx.sellerOrganizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return members.map(toDto);
  }

  async invite(ctx: ResolvedSellerContext, input: { email?: string; phone?: string; role: SellerMembershipRole }): Promise<SellerTeamMemberDto> {
    const user = await this.prisma.user.findFirst({
      where: { OR: [input.email ? { email: input.email } : undefined, input.phone ? { phone: input.phone } : undefined].filter((c): c is NonNullable<typeof c> => !!c) },
    });
    if (!user) throw new NotFoundApiException("User", { email: input.email, phone: input.phone });

    const now = new Date();
    const membership = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sellerMembership.upsert({
        where: { sellerOrganizationId_userId: { sellerOrganizationId: ctx.sellerOrganizationId, userId: user.id } },
        update: { role: input.role, status: SellerMembershipStatus.ACTIVE, acceptedAt: now },
        create: { sellerOrganizationId: ctx.sellerOrganizationId, userId: user.id, role: input.role, status: SellerMembershipStatus.ACTIVE, invitedAt: now, acceptedAt: now },
        include: { user: true },
      });
      await this.events.publish(
        "SellerMembershipCreated",
        { sellerMembershipId: created.id, sellerOrganizationId: ctx.sellerOrganizationId, userId: user.id, role: input.role },
        { tx, aggregateType: "SellerOrganization", aggregateId: ctx.sellerOrganizationId },
      );
      return created;
    });

    return toDto(membership);
  }

  private async loadMembership(ctx: ResolvedSellerContext, membershipId: string) {
    const membership = await this.prisma.sellerMembership.findUnique({ where: { id: membershipId }, include: { user: true } });
    if (!membership || membership.sellerOrganizationId !== ctx.sellerOrganizationId) throw new SellerMembershipNotFoundException({ sellerMembershipId: membershipId });
    return membership;
  }

  /** Spec section 48: "prevent removal of the last active OWNER" — applies to both a role downgrade and a removal. */
  private async assertNotLastOwner(sellerOrganizationId: string, membershipId: string, currentRole: SellerMembershipRole, willStayOwner: boolean): Promise<void> {
    if (currentRole !== SellerMembershipRole.OWNER || willStayOwner) return;
    const remainingOwners = await this.sellerAccess.countActiveOwners(sellerOrganizationId, membershipId);
    if (remainingOwners === 0) throw new SellerLastOwnerException({ sellerOrganizationId, sellerMembershipId: membershipId });
  }

  async updateRole(ctx: ResolvedSellerContext, membershipId: string, role: SellerMembershipRole): Promise<SellerTeamMemberDto> {
    const existing = await this.loadMembership(ctx, membershipId);
    await this.assertNotLastOwner(ctx.sellerOrganizationId, membershipId, existing.role, role === SellerMembershipRole.OWNER);

    const updated = await this.prisma.$transaction(async (tx) => {
      const membership = await tx.sellerMembership.update({ where: { id: membershipId }, data: { role }, include: { user: true } });
      await this.events.publish(
        "SellerMembershipRoleChanged",
        { sellerMembershipId: membershipId, sellerOrganizationId: ctx.sellerOrganizationId, fromRole: existing.role, toRole: role },
        { tx, aggregateType: "SellerOrganization", aggregateId: ctx.sellerOrganizationId },
      );
      return membership;
    });

    return toDto(updated);
  }

  async remove(ctx: ResolvedSellerContext, membershipId: string): Promise<SellerTeamMemberDto> {
    const existing = await this.loadMembership(ctx, membershipId);
    await this.assertNotLastOwner(ctx.sellerOrganizationId, membershipId, existing.role, false);

    const updated = await this.prisma.$transaction(async (tx) => {
      const membership = await tx.sellerMembership.update({ where: { id: membershipId }, data: { status: SellerMembershipStatus.DEACTIVATED }, include: { user: true } });
      await this.events.publish(
        "SellerMembershipDeactivated",
        { sellerMembershipId: membershipId, sellerOrganizationId: ctx.sellerOrganizationId },
        { tx, aggregateType: "SellerOrganization", aggregateId: ctx.sellerOrganizationId },
      );
      return membership;
    });

    return toDto(updated);
  }
}
