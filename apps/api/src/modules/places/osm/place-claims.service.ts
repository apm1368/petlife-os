import { Injectable } from "@nestjs/common";
import { PetFriendlyPlaceStatus, PlaceClaimStatus, ProviderUserRole, ProviderVerificationStatus, type Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ValidationApiException } from "../../../common/errors/api-exception";

export type ClaimNextStep = "CREATE_PARTNER_ACCOUNT" | "COMPLETE_VERIFICATION" | "AWAITING_REVIEW";

/** A member may have this many claims waiting at once (stops a verified partner from sweeping the directory). */
export const MAX_OPEN_CLAIMS_PER_USER = 5;

/** OSM tags staff compare with the claimant's KYC details. */
const COMPARE_TAGS = ["name", "name:fa", "name:en", "phone", "contact:phone", "contact:mobile", "website", "contact:website", "addr:full", "addr:street", "addr:housenumber", "addr:city"];

/**
 * "Is this your business? Claim it." A member files a claim for a business they own; it can only be approved for
 * that same business once it has passed partner KYC (a VERIFIED provider organization the claimant owns). Staff see
 * the KYC'd business details next to the listing's OpenStreetMap tags before deciding, and can release a claim that
 * turns out wrong (the real owner can dispute it with a place report).
 *
 * Next proof once SMS delivery is live: a one-time code sent to the phone number published on the listing itself.
 */
@Injectable()
export class PlaceClaimsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The business the member owns, preferring one that already passed KYC. */
  private async ownedOrganization(userId: string) {
    const memberships = await this.prisma.providerUser.findMany({
      where: { userId, role: ProviderUserRole.OWNER },
      orderBy: { createdAt: "asc" },
      include: { providerOrganization: { select: { id: true, name: true, verificationStatus: true } } },
    });
    const orgs = memberships.map((m) => m.providerOrganization);
    return orgs.find((o) => o.verificationStatus === ProviderVerificationStatus.VERIFIED) ?? orgs[0] ?? null;
  }

  private nextStep(org: { verificationStatus: ProviderVerificationStatus } | null): ClaimNextStep {
    if (!org) return "CREATE_PARTNER_ACCOUNT";
    return org.verificationStatus === ProviderVerificationStatus.VERIFIED ? "AWAITING_REVIEW" : "COMPLETE_VERIFICATION";
  }

  private static claimable(place: { isPubliclyListed: boolean; status: PetFriendlyPlaceStatus }) {
    return place.isPubliclyListed && place.status !== PetFriendlyPlaceStatus.SUSPENDED;
  }

  /** Files a claim, or refreshes an open one (e.g. after finishing KYC) so it names the member's business. */
  async claim(userId: string, placeId: string, message?: string) {
    const place = await this.prisma.petFriendlyPlace.findUnique({ where: { id: placeId } });
    if (!place || !PlaceClaimsService.claimable(place)) throw new ValidationApiException({ field: "place", reason: "PLACE_NOT_CLAIMABLE" });
    if (place.claimedByProviderOrganizationId) throw new ValidationApiException({ field: "place", reason: "ALREADY_CLAIMED" });
    const org = await this.ownedOrganization(userId);
    const open = await this.prisma.placeClaim.findFirst({ where: { placeId, userId, status: PlaceClaimStatus.PENDING } });
    if (!open) {
      const pending = await this.prisma.placeClaim.count({ where: { userId, status: PlaceClaimStatus.PENDING } });
      if (pending >= MAX_OPEN_CLAIMS_PER_USER) throw new ValidationApiException({ field: "claim", reason: "OPEN_CLAIMS_LIMIT" });
    }
    const note = message?.trim().slice(0, 500) || null;
    const claim = open
      ? await this.prisma.placeClaim.update({ where: { id: open.id }, data: { providerOrganizationId: org?.id ?? null, message: note ?? open.message } })
      : await this.prisma.placeClaim.create({ data: { placeId, userId, providerOrganizationId: org?.id ?? null, message: note } });
    return { claimId: claim.id, status: claim.status, nextStep: this.nextStep(org) };
  }

  async mine(userId: string, placeId: string) {
    const claim = await this.prisma.placeClaim.findFirst({ where: { placeId, userId }, orderBy: { createdAt: "desc" } });
    if (!claim) return { claim: null };
    const org = await this.ownedOrganization(userId);
    return { claim: { claimId: claim.id, status: claim.status, nextStep: claim.status === PlaceClaimStatus.PENDING ? this.nextStep(org) : null } };
  }

  /** Staff queue: PENDING claims to decide, or APPROVED ones (to release a wrong one). */
  async list(status: "PENDING" | "APPROVED", page = 1, pageSize = 20) {
    const where: Prisma.PlaceClaimWhereInput = { status };
    const [rows, total] = await Promise.all([
      this.prisma.placeClaim.findMany({
        where,
        orderBy: status === "PENDING" ? { createdAt: "asc" } : { decidedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { place: { select: { id: true, name: true, city: true, category: true, source: true, phone: true, website: true, address: true, osmTags: true, status: true, claimedByProviderOrganizationId: true } } },
      }),
      this.prisma.placeClaim.count({ where }),
    ]);
    const orgIds = [...new Set(rows.map((r) => r.providerOrganizationId).filter((x): x is string => !!x))];
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const [orgs, locations, profiles, users] = await Promise.all([
      this.prisma.providerOrganization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, phone: true, websiteUrl: true, verificationStatus: true } }),
      this.prisma.providerLocation.findMany({ where: { providerOrganizationId: { in: orgIds } }, select: { providerOrganizationId: true, addressLine: true, city: true, phone: true }, orderBy: { createdAt: "asc" } }),
      this.prisma.partnerVerificationProfile.findMany({ where: { subjectType: "PROVIDER", subjectId: { in: orgIds } }, select: { subjectId: true, firstName: true, lastName: true, landline: true, websiteUrl: true } }),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } }),
    ]);
    const orgById = new Map(orgs.map((o) => [o.id, o]));
    const locationByOrg = new Map<string, (typeof locations)[number]>();
    for (const l of locations) if (!locationByOrg.has(l.providerOrganizationId)) locationByOrg.set(l.providerOrganizationId, l);
    const profileByOrg = new Map(profiles.map((p) => [p.subjectId, p]));
    const userById = new Map(users.map((u) => [u.id, u.displayName]));
    return {
      items: rows.map((r) => {
        const org = r.providerOrganizationId ? orgById.get(r.providerOrganizationId) ?? null : null;
        const location = org ? locationByOrg.get(org.id) ?? null : null;
        const profile = org ? profileByOrg.get(org.id) ?? null : null;
        const tags = (r.place.osmTags ?? {}) as Record<string, string>;
        return {
          id: r.id,
          status: r.status,
          place: {
            id: r.place.id,
            name: r.place.name,
            city: r.place.city,
            category: r.place.category,
            source: r.place.source,
            phone: r.place.phone,
            website: r.place.website,
            address: r.place.address,
            // Still held by the business this claim named (only then can it be released from here).
            claimedByThisClaim: !!org && r.place.claimedByProviderOrganizationId === org.id,
            osmTags: Object.fromEntries(COMPARE_TAGS.filter((k) => typeof tags[k] === "string" && tags[k]).map((k) => [k, tags[k]!.slice(0, 200)])),
          },
          claimant: userById.get(r.userId) ?? null,
          organization: org
            ? {
                id: org.id,
                name: org.name,
                verificationStatus: org.verificationStatus,
                phone: org.phone,
                website: org.websiteUrl ?? profile?.websiteUrl ?? null,
                address: location ? { addressLine: location.addressLine, city: location.city, phone: location.phone } : null,
                kycContact: profile ? { name: `${profile.firstName} ${profile.lastName}`.trim(), landline: profile.landline } : null,
              }
            : null,
          message: r.message,
          decisionReason: r.decisionReason,
          createdAt: r.createdAt.toISOString(),
          decidedAt: r.decidedAt?.toISOString() ?? null,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Approve only for the business named on the claim, and only while the claimant still owns it and it is VERIFIED.
   * The audit row is written by the caller in the same transaction.
   */
  async decide(tx: Prisma.TransactionClient, adminUserId: string, claimId: string, approve: boolean, reason: string) {
    const claim = await tx.placeClaim.findUnique({ where: { id: claimId } });
    if (!claim || claim.status !== PlaceClaimStatus.PENDING) throw new ValidationApiException({ field: "claim", reason: "NOT_PENDING" });
    if (approve) {
      const place = await tx.petFriendlyPlace.findUnique({ where: { id: claim.placeId }, select: { isPubliclyListed: true, status: true } });
      if (!place || !PlaceClaimsService.claimable(place)) throw new ValidationApiException({ field: "place", reason: "PLACE_NOT_CLAIMABLE" });
      if (!claim.providerOrganizationId) throw new ValidationApiException({ field: "claim", reason: "NO_ORGANIZATION_ON_CLAIM" });
      const membership = await tx.providerUser.findFirst({
        where: { userId: claim.userId, providerOrganizationId: claim.providerOrganizationId, role: ProviderUserRole.OWNER, providerOrganization: { verificationStatus: ProviderVerificationStatus.VERIFIED } },
        select: { providerOrganizationId: true },
      });
      if (!membership) throw new ValidationApiException({ field: "claim", reason: "ORGANIZATION_NOT_VERIFIED" });
      const updated = await tx.petFriendlyPlace.updateMany({
        where: { id: claim.placeId, claimedByProviderOrganizationId: null, isPubliclyListed: true, status: { not: PetFriendlyPlaceStatus.SUSPENDED } },
        data: { claimedByProviderOrganizationId: membership.providerOrganizationId, claimedAt: new Date(), status: PetFriendlyPlaceStatus.VERIFIED, verificationSource: "CLAIMED_BY_VERIFIED_PARTNER", verifiedAt: new Date() },
      });
      if (!updated.count) throw new ValidationApiException({ field: "place", reason: "ALREADY_CLAIMED" });
      await tx.placeClaim.updateMany({ where: { placeId: claim.placeId, status: PlaceClaimStatus.PENDING, id: { not: claim.id } }, data: { status: PlaceClaimStatus.REJECTED, decisionReason: "Another claim for this listing was approved.", decidedAt: new Date(), decidedByAdminId: adminUserId } });
    }
    return tx.placeClaim.update({
      where: { id: claim.id },
      data: { status: approve ? PlaceClaimStatus.APPROVED : PlaceClaimStatus.REJECTED, decisionReason: reason.trim().slice(0, 500), decidedAt: new Date(), decidedByAdminId: adminUserId },
    });
  }

  /**
   * Takes a listing back from the business that claimed it (a wrong approval, or a dispute upheld). An OpenStreetMap
   * import goes back to an unverified OSM listing; the approved claim is marked withdrawn with the reason.
   */
  async release(tx: Prisma.TransactionClient, adminUserId: string, placeId: string, reason: string) {
    const place = await tx.petFriendlyPlace.findUnique({ where: { id: placeId }, select: { id: true, source: true, claimedByProviderOrganizationId: true } });
    if (!place?.claimedByProviderOrganizationId) throw new ValidationApiException({ field: "place", reason: "NOT_CLAIMED" });
    const osm = place.source === "OSM";
    await tx.petFriendlyPlace.update({
      where: { id: placeId },
      data: {
        claimedByProviderOrganizationId: null,
        claimedAt: null,
        ...(osm ? { status: PetFriendlyPlaceStatus.UNVERIFIED, verificationSource: "OPENSTREETMAP", verifiedAt: null } : { verificationSource: null }),
      },
    });
    await tx.placeClaim.updateMany({
      where: { placeId, status: PlaceClaimStatus.APPROVED, providerOrganizationId: place.claimedByProviderOrganizationId },
      data: { status: PlaceClaimStatus.WITHDRAWN, decisionReason: reason.trim().slice(0, 500), decidedAt: new Date(), decidedByAdminId: adminUserId },
    });
    return { placeId, releasedFromOrganizationId: place.claimedByProviderOrganizationId, status: osm ? PetFriendlyPlaceStatus.UNVERIFIED : null };
  }
}
