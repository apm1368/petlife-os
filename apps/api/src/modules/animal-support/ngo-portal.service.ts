import { Injectable } from "@nestjs/common";
import { AnimalSupportOrgRole, AnimalSupportVerificationStatus, HelpOfferStatus, Prisma, SupportNeedStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import { StorageService } from "../storage/storage.service";
import { DonationLedgerService } from "./donation-ledger.service";
import { toAnimalSupportOrganizationDto } from "./animal-support-mapper";
import { toHelpOfferDto, toSupportNeedListingDto } from "./support-need-mapper";

export interface NgoContext {
  organizationId: string;
  role: AnimalSupportOrgRole;
}

const LIVE_NEEDS: SupportNeedStatus[] = [SupportNeedStatus.PUBLISHED, SupportNeedStatus.PARTIALLY_FULFILLED, SupportNeedStatus.PAUSED];
const SUBMITTABLE: AnimalSupportVerificationStatus[] = [AnimalSupportVerificationStatus.NOT_STARTED, AnimalSupportVerificationStatus.NEEDS_INFORMATION, AnimalSupportVerificationStatus.REJECTED];

/**
 * Batch 6 — NGO / shelter / rescue operations. Every query is scoped to the organization the
 * caller is a member of (resolved server-side by NgoAuthGuard); nothing here takes an
 * organization id from the client. Donations are ledger-derived and carry no donor identity
 * beyond a name the donor chose to show publicly. Offers carry no helper contact details.
 */
@Injectable()
export class NgoPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly donationLedger: DonationLedgerService,
    private readonly storage: StorageService,
    private readonly events: DomainEventsService,
  ) {}

  async memberships(userId: string) {
    const rows = await this.prisma.animalSupportOrgMembership.findMany({ where: { userId, isActive: true }, include: { organization: { select: { id: true, name: true, type: true, verificationStatus: true } } }, orderBy: { createdAt: "asc" } });
    return rows.map((r) => ({ organizationId: r.organizationId, role: r.role, organization: r.organization }));
  }

  async overview(ctx: NgoContext) {
    const orgId = ctx.organizationId;
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [org, needsByStatus, pendingOffers, activeOffers, balance, received30, team] = await Promise.all([
      this.prisma.animalSupportOrganization.findUniqueOrThrow({ where: { id: orgId } }),
      this.prisma.supportNeedListing.groupBy({ by: ["status"], where: { organizationId: orgId }, _count: { _all: true } }),
      this.prisma.helpOffer.count({ where: { listing: { organizationId: orgId }, status: HelpOfferStatus.PENDING } }),
      this.prisma.helpOffer.count({ where: { listing: { organizationId: orgId }, status: { in: [HelpOfferStatus.ACCEPTED, HelpOfferStatus.IN_PROGRESS] } } }),
      this.donationLedger.getBalance(orgId),
      this.prisma.donationTransaction.aggregate({ where: { organizationId: orgId, createdAt: { gte: since }, refundedAt: null }, _sum: { amountIrr: true }, _count: { _all: true } }),
      this.prisma.animalSupportOrgMembership.count({ where: { organizationId: orgId, isActive: true } }),
    ]);
    const count = (s: SupportNeedStatus) => needsByStatus.find((g) => g.status === s)?._count._all ?? 0;
    return {
      organization: toAnimalSupportOrganizationDto(org),
      role: ctx.role,
      needs: { live: LIVE_NEEDS.reduce((sum, s) => sum + count(s), 0), pendingReview: count(SupportNeedStatus.PENDING_REVIEW), partiallyFulfilled: count(SupportNeedStatus.PARTIALLY_FULFILLED), fulfilled: count(SupportNeedStatus.FULFILLED), needsChanges: count(SupportNeedStatus.REJECTED) },
      offers: { pending: pendingOffers, active: activeOffers },
      donations: { receivedLast30DaysIrr: received30._sum.amountIrr ?? 0, countLast30Days: received30._count._all, generalAvailableIrr: balance.generalAvailableIrr, restrictedAvailableIrr: balance.restrictedAvailableIrr, paidOutIrr: balance.paidIrr },
      teamSize: team,
    };
  }

  async needs(ctx: NgoContext, query: { status?: SupportNeedStatus; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.SupportNeedListingWhereInput = { organizationId: ctx.organizationId, ...(query.status ? { status: query.status } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.supportNeedListing.findMany({ where, include: { organization: { select: { name: true, verificationStatus: true, isPubliclyListed: true } } }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip, take }),
      this.prisma.supportNeedListing.count({ where }),
    ]);
    return toPaginatedDto(rows.map((r) => toSupportNeedListingDto(r, true)), total, page, pageSize);
  }

  /** Offers across the organization's listings; `volunteer` narrows to volunteering help. */
  async offers(ctx: NgoContext, query: { status?: HelpOfferStatus; volunteer?: boolean; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.HelpOfferWhereInput = {
      listing: { organizationId: ctx.organizationId },
      ...(query.status ? { status: query.status } : {}),
      ...(query.volunteer ? { OR: [{ helpType: "VOLUNTEER" }, { listing: { category: "VOLUNTEER" } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.helpOffer.findMany({ where, include: { listing: { select: { id: true, title: true, category: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take }),
      this.prisma.helpOffer.count({ where }),
    ]);
    return toPaginatedDto(rows.map((r) => ({ ...toHelpOfferDto(r), listingTitle: r.listing.title, listingCategory: r.listing.category })), total, page, pageSize);
  }

  /** Ledger-derived donations to this organization. No donor account, contact or payment identity. */
  async donations(ctx: NgoContext, query: { page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.DonationTransactionWhereInput = { organizationId: ctx.organizationId };
    const [rows, total, balance] = await Promise.all([
      this.prisma.donationTransaction.findMany({ where, include: { campaign: { select: { id: true, title: true } }, donationIntent: { select: { showDonorPublicly: true, publicDisplayName: true, supportNeedListingId: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take }),
      this.prisma.donationTransaction.count({ where }),
      this.donationLedger.getBalance(ctx.organizationId),
    ]);
    return {
      balance,
      ...toPaginatedDto(
        rows.map((r) => ({ id: r.id, amountIrr: r.amountIrr, fundType: r.fundType, campaign: r.campaign, supportNeedListingId: r.donationIntent.supportNeedListingId, donorName: r.donationIntent.showDonorPublicly ? r.donationIntent.publicDisplayName : null, createdAt: r.createdAt.toISOString(), refundedAt: r.refundedAt?.toISOString() ?? null })),
        total,
        page,
        pageSize,
      ),
    };
  }

  async team(ctx: NgoContext) {
    const rows = await this.prisma.animalSupportOrgMembership.findMany({ where: { organizationId: ctx.organizationId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, displayName: true } });
    const name = new Map(users.map((u) => [u.id, u.displayName]));
    return rows.map((r) => ({ id: r.id, displayName: name.get(r.userId) ?? null, role: r.role, isActive: r.isActive, createdAt: r.createdAt.toISOString() }));
  }

  /** OWNER only (checked by the controller). Grants an existing PET LIFE account by e-mail. */
  async addMember(ctx: NgoContext, email: string, role: AnimalSupportOrgRole) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } });
    if (!user) throw new NotFoundApiException("User");
    const row = await this.prisma.animalSupportOrgMembership.upsert({
      where: { organizationId_userId: { organizationId: ctx.organizationId, userId: user.id } },
      create: { organizationId: ctx.organizationId, userId: user.id, role },
      update: { role, isActive: true },
    });
    return { id: row.id, role: row.role, isActive: row.isActive };
  }

  async updateMember(ctx: NgoContext, actorUserId: string, membershipId: string, input: { role?: AnimalSupportOrgRole; isActive?: boolean }) {
    const row = await this.prisma.animalSupportOrgMembership.findFirst({ where: { id: membershipId, organizationId: ctx.organizationId } });
    if (!row) throw new NotFoundApiException("Membership");
    const demotingLastOwner = row.role === AnimalSupportOrgRole.OWNER && (input.isActive === false || (input.role && input.role !== AnimalSupportOrgRole.OWNER));
    if (demotingLastOwner) {
      const owners = await this.prisma.animalSupportOrgMembership.count({ where: { organizationId: ctx.organizationId, role: AnimalSupportOrgRole.OWNER, isActive: true } });
      if (owners <= 1) throw new ValidationApiException({ field: "role", reason: "LAST_OWNER" });
    }
    void actorUserId;
    const updated = await this.prisma.animalSupportOrgMembership.update({ where: { id: membershipId }, data: { ...(input.role ? { role: input.role } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) } });
    return { id: updated.id, role: updated.role, isActive: updated.isActive };
  }

  async verification(ctx: NgoContext) {
    const org = await this.prisma.animalSupportOrganization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
    return { status: org.verificationStatus, submittedAt: org.verificationSubmittedAt?.toISOString() ?? null, note: org.verificationNote, documentCount: org.verificationDocumentKeys.length, canSubmit: SUBMITTABLE.includes(org.verificationStatus) };
  }

  async requestVerificationUpload(ctx: NgoContext, contentType: string, fileSizeBytes: number) {
    return this.storage.createOrgVerificationDocumentUploadTarget(ctx.organizationId, contentType, fileSizeBytes);
  }

  /** Submits for PET LIFE review. Document keys must be ones issued for this organization. */
  async submitVerification(ctx: NgoContext, userId: string, documentKeys: string[]) {
    const org = await this.prisma.animalSupportOrganization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
    if (!SUBMITTABLE.includes(org.verificationStatus)) throw new ValidationApiException({ field: "verificationStatus", reason: "ALREADY_SUBMITTED_OR_VERIFIED" });
    const prefix = `animal-support-verification/${ctx.organizationId}/`;
    if (documentKeys.length === 0 || documentKeys.some((k) => !k.startsWith(prefix) || k.includes(".."))) throw new ValidationApiException({ field: "documentKeys", reason: "INVALID_DOCUMENTS" });
    await this.prisma.$transaction(async (tx) => {
      await tx.animalSupportOrganization.update({ where: { id: ctx.organizationId }, data: { verificationStatus: AnimalSupportVerificationStatus.SUBMITTED, verificationSubmittedAt: new Date(), verificationDocumentKeys: [...new Set(documentKeys)].slice(0, 10) } });
      await this.events.publish("AnimalSupportOrganizationVerificationSubmitted", { organizationId: ctx.organizationId, submittedByUserId: userId }, { tx, aggregateType: "AnimalSupportOrganization", aggregateId: ctx.organizationId });
    });
    return this.verification(ctx);
  }

  /** OWNER may edit the public profile text and official contact; name, type, verification and listing stay with PET LIFE. */
  async updateProfile(ctx: NgoContext, input: { description?: string; location?: string; contactEmail?: string | null; contactPhone?: string | null }) {
    const row = await this.prisma.animalSupportOrganization.update({ where: { id: ctx.organizationId }, data: { description: input.description, location: input.location, contactEmail: input.contactEmail, contactPhone: input.contactPhone } });
    return toAnimalSupportOrganizationDto(row);
  }
}
