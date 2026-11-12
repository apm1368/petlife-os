import { Injectable } from "@nestjs/common";
import { PetFriendlyPlaceStatus, PlaceClaimStatus, ProviderUserRole, ProviderVerificationStatus, type Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ValidationApiException } from "../../../common/errors/api-exception";

export type ClaimNextStep = "CREATE_PARTNER_ACCOUNT" | "COMPLETE_VERIFICATION" | "AWAITING_REVIEW";

/**
 * "Is this your business? Claim it." A member files a claim; it can only be approved for a business that passed
 * partner KYC (a VERIFIED provider organization the member owns). Approval hands the listing to that business,
 * marks it verified, and stops OSM re-sync from changing it.
 */
@Injectable()
export class PlaceClaimsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ownedOrganization(userId: string) {
    const membership = await this.prisma.providerUser.findFirst({
      where: { userId, role: ProviderUserRole.OWNER },
      orderBy: { createdAt: "asc" },
      include: { providerOrganization: { select: { id: true, name: true, verificationStatus: true } } },
    });
    return membership?.providerOrganization ?? null;
  }

  private nextStep(org: { verificationStatus: ProviderVerificationStatus } | null): ClaimNextStep {
    if (!org) return "CREATE_PARTNER_ACCOUNT";
    return org.verificationStatus === ProviderVerificationStatus.VERIFIED ? "AWAITING_REVIEW" : "COMPLETE_VERIFICATION";
  }

  async claim(userId: string, placeId: string, message?: string) {
    const place = await this.prisma.petFriendlyPlace.findUnique({ where: { id: placeId } });
    if (!place || !place.isPubliclyListed) throw new ValidationApiException({ field: "place", reason: "NOT_FOUND" });
    if (place.claimedByProviderOrganizationId) throw new ValidationApiException({ field: "place", reason: "ALREADY_CLAIMED" });
    const org = await this.ownedOrganization(userId);
    const open = await this.prisma.placeClaim.findFirst({ where: { placeId, userId, status: PlaceClaimStatus.PENDING } });
    const claim = open
      ? await this.prisma.placeClaim.update({ where: { id: open.id }, data: { providerOrganizationId: org?.id ?? null, message: message?.trim().slice(0, 500) || open.message } })
      : await this.prisma.placeClaim.create({ data: { placeId, userId, providerOrganizationId: org?.id ?? null, message: message?.trim().slice(0, 500) || null } });
    return { claimId: claim.id, status: claim.status, nextStep: this.nextStep(org) };
  }

  async mine(userId: string, placeId: string) {
    const claim = await this.prisma.placeClaim.findFirst({ where: { placeId, userId }, orderBy: { createdAt: "desc" } });
    if (!claim) return { claim: null };
    const org = await this.ownedOrganization(userId);
    return { claim: { claimId: claim.id, status: claim.status, nextStep: claim.status === PlaceClaimStatus.PENDING ? this.nextStep(org) : null } };
  }

  async listPending(page = 1, pageSize = 20) {
    const where: Prisma.PlaceClaimWhereInput = { status: PlaceClaimStatus.PENDING };
    const [rows, total] = await Promise.all([
      this.prisma.placeClaim.findMany({ where, orderBy: { createdAt: "asc" }, skip: (page - 1) * pageSize, take: pageSize, include: { place: { select: { id: true, name: true, city: true, category: true, source: true } } } }),
      this.prisma.placeClaim.count({ where }),
    ]);
    const orgIds = [...new Set(rows.map((r) => r.providerOrganizationId).filter((x): x is string => !!x))];
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const [orgs, users] = await Promise.all([
      this.prisma.providerOrganization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, verificationStatus: true } }),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } }),
    ]);
    const orgById = new Map(orgs.map((o) => [o.id, o]));
    const userById = new Map(users.map((u) => [u.id, u.displayName]));
    return {
      items: rows.map((r) => ({
        id: r.id,
        place: r.place,
        claimant: userById.get(r.userId) ?? null,
        organization: r.providerOrganizationId ? orgById.get(r.providerOrganizationId) ?? null : null,
        message: r.message,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Approve only with a VERIFIED organization; the audit row is written by the caller in the same transaction. */
  async decide(tx: Prisma.TransactionClient, adminUserId: string, claimId: string, approve: boolean, reason: string) {
    const claim = await tx.placeClaim.findUnique({ where: { id: claimId } });
    if (!claim || claim.status !== PlaceClaimStatus.PENDING) throw new ValidationApiException({ field: "claim", reason: "NOT_PENDING" });
    if (approve) {
      // Re-resolve the organization now: the claimant may have finished KYC since filing.
      const membership = await tx.providerUser.findFirst({ where: { userId: claim.userId, role: ProviderUserRole.OWNER, providerOrganization: { verificationStatus: ProviderVerificationStatus.VERIFIED } }, orderBy: { createdAt: "asc" } });
      if (!membership) throw new ValidationApiException({ field: "claim", reason: "ORGANIZATION_NOT_VERIFIED" });
      const place = await tx.petFriendlyPlace.updateMany({
        where: { id: claim.placeId, claimedByProviderOrganizationId: null },
        data: { claimedByProviderOrganizationId: membership.providerOrganizationId, claimedAt: new Date(), status: PetFriendlyPlaceStatus.VERIFIED, verificationSource: "CLAIMED_BY_VERIFIED_PARTNER", verifiedAt: new Date() },
      });
      if (!place.count) throw new ValidationApiException({ field: "place", reason: "ALREADY_CLAIMED" });
      await tx.placeClaim.updateMany({ where: { placeId: claim.placeId, status: PlaceClaimStatus.PENDING, id: { not: claim.id } }, data: { status: PlaceClaimStatus.REJECTED, decisionReason: "Another claim for this listing was approved.", decidedAt: new Date(), decidedByAdminId: adminUserId } });
    }
    return tx.placeClaim.update({
      where: { id: claim.id },
      data: { status: approve ? PlaceClaimStatus.APPROVED : PlaceClaimStatus.REJECTED, decisionReason: reason.trim().slice(0, 500), decidedAt: new Date(), decidedByAdminId: adminUserId },
    });
  }
}
