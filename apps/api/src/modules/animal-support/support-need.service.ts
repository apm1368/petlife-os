import { Injectable } from "@nestjs/common";
import { AnimalSupportVerificationStatus, HelpOfferStatus, Prisma, SupportNeedStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { StorageService } from "../storage/storage.service";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import {
  AnimalSupportOrganizationNotFoundException,
  DuplicateHelpOfferException,
  HelpOfferNotFoundException,
  InvalidHelpOfferTransitionException,
  InvalidSupportNeedTransitionException,
  SupportCampaignNotFoundException,
  SupportNeedDeadlineInvalidException,
  SupportNeedListingAccessDeniedException,
  SupportNeedListingNotEditableException,
  SupportNeedListingNotFoundException,
} from "../../common/errors/api-exception";
import { toHelpOfferDto, toSupportNeedListingDto } from "./support-need-mapper";
import type {
  CreateHelpOfferDto,
  CreateSupportNeedListingDto,
  ListMySupportNeedListingsQueryDto,
  ListSupportNeedListingsQueryDto,
  RespondToHelpOfferDto,
  UpdateSupportNeedListingDto,
} from "./dto/support-need.dto";

const LISTING_INCLUDE = {
  organization: { select: { name: true, verificationStatus: true, isPubliclyListed: true } },
} satisfies Prisma.SupportNeedListingInclude;

/**
 * The only statuses a listing is publicly discoverable in. FULFILLED stays
 * visible so a browser can see the need was met (and the publisher gets
 * credit for closing the loop); DRAFT/PENDING_REVIEW/REJECTED/REMOVED never
 * appear publicly, per the spec's "closed/private/rejected listings should
 * not be indexed".
 */
const PUBLICLY_VISIBLE: SupportNeedStatus[] = [SupportNeedStatus.PUBLISHED, SupportNeedStatus.PARTIALLY_FULFILLED, SupportNeedStatus.FULFILLED];
/** A paused listing is still reachable by its link (so shared links don't break) but is not listed in search. */
const DETAIL_VISIBLE: SupportNeedStatus[] = [...PUBLICLY_VISIBLE, SupportNeedStatus.PAUSED];
/** Only these accept new help offers. */
const ACCEPTING_OFFERS: SupportNeedStatus[] = [SupportNeedStatus.PUBLISHED, SupportNeedStatus.PARTIALLY_FULFILLED];

/**
 * Explicit publisher-driven transitions. Anything not listed here is
 * rejected — there is deliberately no "set any status" endpoint, matching
 * the state-machine discipline every other PET LIFE domain uses.
 */
const PUBLISHER_TRANSITIONS: Record<SupportNeedStatus, SupportNeedStatus[]> = {
  [SupportNeedStatus.DRAFT]: [SupportNeedStatus.PENDING_REVIEW, SupportNeedStatus.CLOSED],
  [SupportNeedStatus.PENDING_REVIEW]: [SupportNeedStatus.CLOSED],
  [SupportNeedStatus.PUBLISHED]: [SupportNeedStatus.PAUSED, SupportNeedStatus.FULFILLED, SupportNeedStatus.CLOSED],
  [SupportNeedStatus.PARTIALLY_FULFILLED]: [SupportNeedStatus.PAUSED, SupportNeedStatus.FULFILLED, SupportNeedStatus.CLOSED],
  // Resuming returns to PUBLISHED; transitionAsPublisher maps it to PARTIALLY_FULFILLED when progress exists.
  [SupportNeedStatus.PAUSED]: [SupportNeedStatus.PUBLISHED, SupportNeedStatus.CLOSED],
  [SupportNeedStatus.FULFILLED]: [SupportNeedStatus.CLOSED],
  [SupportNeedStatus.CLOSED]: [],
  [SupportNeedStatus.EXPIRED]: [SupportNeedStatus.CLOSED],
  // A rejected listing goes back to the publisher to fix and resubmit.
  [SupportNeedStatus.REJECTED]: [SupportNeedStatus.PENDING_REVIEW, SupportNeedStatus.CLOSED],
  [SupportNeedStatus.REMOVED]: [],
};

/** A publisher may still edit content while the listing has not been seen publicly, or after a rejection. */
const EDITABLE_STATUSES: SupportNeedStatus[] = [SupportNeedStatus.DRAFT, SupportNeedStatus.PENDING_REVIEW, SupportNeedStatus.REJECTED, SupportNeedStatus.PUBLISHED, SupportNeedStatus.PARTIALLY_FULFILLED, SupportNeedStatus.PAUSED];

/** Offers a helper may still cancel / a publisher may still act on. */
const OFFER_TRANSITIONS: Record<HelpOfferStatus, HelpOfferStatus[]> = {
  [HelpOfferStatus.PENDING]: [HelpOfferStatus.ACCEPTED, HelpOfferStatus.DECLINED, HelpOfferStatus.CANCELLED],
  [HelpOfferStatus.ACCEPTED]: [HelpOfferStatus.IN_PROGRESS, HelpOfferStatus.COMPLETED, HelpOfferStatus.CANCELLED],
  [HelpOfferStatus.IN_PROGRESS]: [HelpOfferStatus.COMPLETED, HelpOfferStatus.CANCELLED],
  [HelpOfferStatus.DECLINED]: [],
  [HelpOfferStatus.COMPLETED]: [],
  [HelpOfferStatus.CANCELLED]: [],
};

/**
 * Handoff 22 — Animal Support classifieds ("needs board", Divar-shaped).
 *
 * Deliberately NOT a second donation system: a listing that accepts money
 * carries only a `campaignId` pointing at an existing Handoff 18
 * SupportCampaign, so every rial still moves through DonationService and
 * the donation ledger. This service never touches money.
 *
 * It is also not a contact directory: the publisher's phone/email is never
 * returned by any endpoint here. The only channel is a HelpOffer.
 */
@Injectable()
export class SupportNeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly storage: StorageService,
  ) {}

  private async getRawOrThrow(listingId: string) {
    const row = await this.prisma.supportNeedListing.findUnique({ where: { id: listingId }, include: LISTING_INCLUDE });
    if (!row) throw new SupportNeedListingNotFoundException({ listingId });
    return row;
  }

  /** Publisher identity check: the creating user, or any member acting for the owning organization (organization staff portals do not exist yet — see README). */
  private assertIsPublisher(row: { creatorUserId: string | null }, userId: string): void {
    if (row.creatorUserId !== userId) throw new SupportNeedListingAccessDeniedException({ listingId: (row as { id?: string }).id });
  }

  // -- Publisher: create / edit ------------------------------------------------

  /** A deadline must be in the future and at most 180 days away. */
  private assertDeadline(expiresAt: string | null | undefined) {
    if (!expiresAt) return;
    const t = new Date(expiresAt).getTime();
    if (t <= Date.now() || t > Date.now() + 180 * 86_400_000) throw new SupportNeedDeadlineInvalidException({ expiresAt });
  }

  async create(userId: string, dto: CreateSupportNeedListingDto) {
    this.assertDeadline(dto.expiresAt);
    if (dto.organizationId) {
      const org = await this.prisma.animalSupportOrganization.findUnique({ where: { id: dto.organizationId } });
      if (!org) throw new AnimalSupportOrganizationNotFoundException({ organizationId: dto.organizationId });
    }
    if (dto.campaignId) {
      const campaign = await this.prisma.supportCampaign.findUnique({ where: { id: dto.campaignId } });
      if (!campaign) throw new SupportCampaignNotFoundException({ campaignId: dto.campaignId });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportNeedListing.create({
        data: {
          creatorUserId: userId,
          organizationId: dto.organizationId,
          title: dto.title,
          description: dto.description,
          category: dto.category,
          urgency: dto.urgency,
          province: dto.province,
          city: dto.city,
          neighborhood: dto.neighborhood,
          latitude: dto.latitude,
          longitude: dto.longitude,
          imageObjectKeys: dto.imageObjectKeys ?? [],
          neededQuantity: dto.neededQuantity,
          quantityUnit: dto.quantityUnit,
          campaignId: dto.campaignId,
          contactMode: dto.contactMode,
          animalType: dto.animalType,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        },
        include: LISTING_INCLUDE,
      });
      await this.events.publish(
        "SupportNeedListingCreated",
        { listingId: created.id, category: created.category, creatorUserId: userId },
        { tx, aggregateType: "SupportNeedListing", aggregateId: created.id },
      );
      return created;
    });
    return toSupportNeedListingDto(row, true);
  }

  async update(listingId: string, userId: string, dto: UpdateSupportNeedListingDto) {
    const existing = await this.getRawOrThrow(listingId);
    this.assertIsPublisher(existing, userId);
    if (!EDITABLE_STATUSES.includes(existing.status)) throw new SupportNeedListingNotEditableException({ listingId, status: existing.status });
    this.assertDeadline(dto.expiresAt);

    const updated = await this.prisma.supportNeedListing.update({
      where: { id: listingId },
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        urgency: dto.urgency,
        province: dto.province,
        city: dto.city,
        neighborhood: dto.neighborhood,
        imageObjectKeys: dto.imageObjectKeys,
        neededQuantity: dto.neededQuantity,
        quantityUnit: dto.quantityUnit,
        animalType: dto.animalType,
        ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null, expiryWarnedAt: null } : {}),
      },
      include: LISTING_INCLUDE,
    });
    return toSupportNeedListingDto(updated, true);
  }

  /**
   * Submits a draft for moderation. The spec models PENDING_REVIEW as a real
   * state, so publishing is never a client-side flip: an admin moves it to
   * PUBLISHED (see AdminSupportNeedService.review).
   */
  async submitForReview(listingId: string, userId: string) {
    return this.transitionAsPublisher(listingId, userId, SupportNeedStatus.PENDING_REVIEW);
  }

  async markFulfilled(listingId: string, userId: string) {
    return this.transitionAsPublisher(listingId, userId, SupportNeedStatus.FULFILLED);
  }

  async close(listingId: string, userId: string) {
    return this.transitionAsPublisher(listingId, userId, SupportNeedStatus.CLOSED);
  }

  async pause(listingId: string, userId: string) {
    return this.transitionAsPublisher(listingId, userId, SupportNeedStatus.PAUSED);
  }

  async resume(listingId: string, userId: string) {
    return this.transitionAsPublisher(listingId, userId, SupportNeedStatus.PUBLISHED);
  }

  private async transitionAsPublisher(listingId: string, userId: string, requested: SupportNeedStatus) {
    const existing = await this.getRawOrThrow(listingId);
    this.assertIsPublisher(existing, userId);
    if (!PUBLISHER_TRANSITIONS[existing.status].includes(requested)) {
      throw new InvalidSupportNeedTransitionException({ listingId, from: existing.status, to: requested });
    }
    // Resuming a listing that already has progress returns it to PARTIALLY_FULFILLED, never back to zero.
    const next = requested === SupportNeedStatus.PUBLISHED && existing.status === SupportNeedStatus.PAUSED && existing.fulfilledQuantity > 0 ? SupportNeedStatus.PARTIALLY_FULFILLED : requested;

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.supportNeedListing.update({
        where: { id: listingId },
        data: {
          status: next,
          fulfilledAt: next === SupportNeedStatus.FULFILLED ? new Date() : undefined,
          closedAt: next === SupportNeedStatus.CLOSED ? new Date() : undefined,
          // Resubmitting after a rejection clears the stale moderation note.
          reviewNote: next === SupportNeedStatus.PENDING_REVIEW ? null : undefined,
        },
        include: LISTING_INCLUDE,
      });
      await this.events.publish(
        "SupportNeedListingStatusChanged",
        { listingId, from: existing.status, to: next },
        { tx, aggregateType: "SupportNeedListing", aggregateId: listingId },
      );
      return updated;
    });
    return toSupportNeedListingDto(row, true);
  }

  // -- Public discovery --------------------------------------------------------

  /** Divar-style browse: newest first, filtered by category/urgency/location/free text. Only publicly-visible statuses are ever returned. */
  async listPublic(query: ListSupportNeedListingsQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const statuses = query.state === "RESOLVED" ? [SupportNeedStatus.FULFILLED] : query.state === "ALL" ? PUBLICLY_VISIBLE : ACCEPTING_OFFERS;
    const where: Prisma.SupportNeedListingWhereInput = {
      status: { in: statuses },
      category: query.category,
      urgency: query.urgency,
      province: query.province,
      city: query.city,
      organizationId: query.organizationId,
    };
    if (query.search) {
      where.OR = [{ title: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }];
    }

    const [rows, total] = await Promise.all([
      this.prisma.supportNeedListing.findMany({
        where,
        include: LISTING_INCLUDE,
        // Only explicit data, never opaque ranking: urgency (default), newest, or nearest deadline.
        orderBy:
          query.sort === "RECENT"
            ? [{ publishedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }]
            : query.sort === "CLOSING_SOON"
              ? [{ expiresAt: { sort: "asc", nulls: "last" } }, { urgency: "desc" }, { id: "asc" }]
              : [{ urgency: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
        skip,
        take,
      }),
      this.prisma.supportNeedListing.count({ where }),
    ]);
    return toPaginatedDto(
      rows.map((row) => toSupportNeedListingDto(row)),
      total,
      page,
      pageSize,
    );
  }

  async getPublic(listingId: string) {
    const row = await this.prisma.supportNeedListing.findFirst({ where: { id: listingId, status: { in: DETAIL_VISIBLE } }, include: LISTING_INCLUDE });
    if (!row) throw new SupportNeedListingNotFoundException({ listingId });
    return toSupportNeedListingDto(row);
  }

  /** Distinct provinces/cities that actually have live listings — powers the location filter without a hardcoded geography table. */
  async listPublicLocations() {
    const rows = await this.prisma.supportNeedListing.findMany({
      where: { status: { in: PUBLICLY_VISIBLE } },
      select: { province: true, city: true },
      distinct: ["province", "city"],
      orderBy: [{ province: "asc" }, { city: "asc" }],
    });
    return rows;
  }

  // -- Publisher: my listings --------------------------------------------------

  async listMine(userId: string, query: ListMySupportNeedListingsQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.SupportNeedListingWhereInput = { creatorUserId: userId, status: query.status };
    const [rows, total] = await Promise.all([
      this.prisma.supportNeedListing.findMany({ where, include: LISTING_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.supportNeedListing.count({ where }),
    ]);
    return toPaginatedDto(
      rows.map((row) => toSupportNeedListingDto(row, true)),
      total,
      page,
      pageSize,
    );
  }

  async getMine(listingId: string, userId: string) {
    const row = await this.getRawOrThrow(listingId);
    this.assertIsPublisher(row, userId);
    return toSupportNeedListingDto(row, true);
  }

  async requestImageUpload(userId: string, contentType: string, fileSizeBytes: number) {
    return this.storage.createSupportNeedImageUploadTarget(userId, contentType, fileSizeBytes);
  }

  // -- Help offers -------------------------------------------------------------

  /**
   * A helper responds to a live listing. Only PUBLISHED listings accept
   * offers — you cannot offer help on a draft, a fulfilled need, or one an
   * admin removed.
   */
  async createHelpOffer(listingId: string, helperUserId: string, dto: CreateHelpOfferDto) {
    const listing = await this.getRawOrThrow(listingId);
    if (!ACCEPTING_OFFERS.includes(listing.status)) throw new InvalidSupportNeedTransitionException({ listingId, status: listing.status, reason: "LISTING_NOT_ACCEPTING_OFFERS" });
    if (listing.expiresAt && listing.expiresAt <= new Date()) throw new InvalidSupportNeedTransitionException({ listingId, status: listing.status, reason: "LISTING_EXPIRED" });
    if (listing.creatorUserId === helperUserId) throw new SupportNeedListingAccessDeniedException({ listingId, reason: "CANNOT_OFFER_ON_OWN_LISTING" });

    const open = await this.prisma.helpOffer.findFirst({
      where: { listingId, helperUserId, status: { in: [HelpOfferStatus.PENDING, HelpOfferStatus.ACCEPTED, HelpOfferStatus.IN_PROGRESS] } },
    });
    if (open) throw new DuplicateHelpOfferException({ listingId, existingOfferId: open.id });

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.helpOffer.create({
        data: { listingId, helperUserId, message: dto.message, helpType: dto.helpType, quantity: dto.quantity, timing: dto.timing },
      });
      await this.events.publish(
        "SupportNeedHelpOffered",
        { listingId, offerId: created.id, helperUserId },
        { tx, aggregateType: "SupportNeedListing", aggregateId: listingId },
      );
      return created;
    });
    return toHelpOfferDto(row);
  }

  /** The publisher's inbox for one listing. Returns helper ids only — never a helper's contact details. */
  async listHelpOffers(listingId: string, userId: string) {
    const listing = await this.getRawOrThrow(listingId);
    this.assertIsPublisher(listing, userId);
    const rows = await this.prisma.helpOffer.findMany({ where: { listingId }, orderBy: { createdAt: "desc" } });
    return rows.map(toHelpOfferDto);
  }

  /** A helper's own offers across all listings. */
  async listMyHelpOffers(helperUserId: string) {
    const rows = await this.prisma.helpOffer.findMany({ where: { helperUserId }, orderBy: { createdAt: "desc" } });
    return rows.map(toHelpOfferDto);
  }

  /**
   * Accept / decline / complete (publisher) or cancel (helper). Completing an
   * offer is the only way `fulfilledQuantity` on the listing ever moves, and
   * it is clamped to the stated need so progress can never exceed 100%.
   */
  async respondToHelpOffer(listingId: string, offerId: string, userId: string, dto: RespondToHelpOfferDto) {
    const listing = await this.getRawOrThrow(listingId);
    const offer = await this.prisma.helpOffer.findFirst({ where: { id: offerId, listingId } });
    if (!offer) throw new HelpOfferNotFoundException({ listingId, offerId });

    const isPublisher = listing.creatorUserId === userId;
    const isHelper = offer.helperUserId === userId;
    // Cancelling is the helper's own right; every other transition is the publisher's.
    const allowed = dto.status === HelpOfferStatus.CANCELLED ? isHelper || isPublisher : isPublisher;
    if (!allowed) throw new SupportNeedListingAccessDeniedException({ listingId, offerId });

    if (!OFFER_TRANSITIONS[offer.status].includes(dto.status)) {
      throw new InvalidHelpOfferTransitionException({ offerId, from: offer.status, to: dto.status });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.helpOffer.update({
        where: { id: offerId },
        data: {
          status: dto.status,
          respondedAt: new Date(),
          fulfilledQuantity: dto.status === HelpOfferStatus.COMPLETED ? (dto.fulfilledQuantity ?? offer.quantity ?? null) : undefined,
        },
      });

      let listingStatusChange: { from: SupportNeedStatus; to: SupportNeedStatus } | null = null;
      if (dto.status === HelpOfferStatus.COMPLETED) {
        const contributed = updated.fulfilledQuantity ?? 0;
        const current = await tx.supportNeedListing.findUniqueOrThrow({ where: { id: listingId }, select: { status: true, fulfilledQuantity: true, neededQuantity: true } });
        const nextQty = contributed > 0 ? (current.neededQuantity === null ? current.fulfilledQuantity + contributed : Math.min(current.neededQuantity, current.fulfilledQuantity + contributed)) : current.fulfilledQuantity;
        // Progress drives the listing state: some → PARTIALLY_FULFILLED, all → FULFILLED (no new offers).
        let nextStatus = current.status;
        if (current.status === SupportNeedStatus.PUBLISHED || current.status === SupportNeedStatus.PARTIALLY_FULFILLED) {
          if (current.neededQuantity !== null && nextQty >= current.neededQuantity) nextStatus = SupportNeedStatus.FULFILLED;
          else if (nextQty > 0) nextStatus = SupportNeedStatus.PARTIALLY_FULFILLED;
        }
        await tx.supportNeedListing.update({
          where: { id: listingId },
          data: { fulfilledQuantity: nextQty, status: nextStatus, fulfilledAt: nextStatus === SupportNeedStatus.FULFILLED && current.status !== SupportNeedStatus.FULFILLED ? new Date() : undefined },
        });
        if (nextStatus !== current.status) {
          listingStatusChange = { from: current.status, to: nextStatus };
          await this.events.publish("SupportNeedListingStatusChanged", { listingId, from: current.status, to: nextStatus }, { tx, aggregateType: "SupportNeedListing", aggregateId: listingId });
        }
      }
      void listingStatusChange;

      await this.events.publish(
        "SupportNeedHelpOfferResolved",
        { listingId, offerId, status: dto.status, helperUserId: offer.helperUserId, publisherUserId: listing.creatorUserId, byHelper: isHelper && !isPublisher },
        { tx, aggregateType: "SupportNeedListing", aggregateId: listingId },
      );
      return updated;
    });
    return toHelpOfferDto(row);
  }

  /** Public, coarse progress for a listing detail page — counts only, never helper identities. */
  async getPublicOfferSummary(listingId: string) {
    const listing = await this.getPublic(listingId);
    const grouped = await this.prisma.helpOffer.groupBy({ by: ["status"], where: { listingId }, _count: { _all: true } });
    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
    return {
      listingId: listing.id,
      neededQuantity: listing.neededQuantity,
      fulfilledQuantity: listing.fulfilledQuantity,
      pendingOffers: counts[HelpOfferStatus.PENDING] ?? 0,
      acceptedOffers: counts[HelpOfferStatus.ACCEPTED] ?? 0,
      inProgressOffers: counts[HelpOfferStatus.IN_PROGRESS] ?? 0,
      completedOffers: counts[HelpOfferStatus.COMPLETED] ?? 0,
    };
  }

  // -- Expiry ------------------------------------------------------------------

  /**
   * Batch 6 — deadlines. Listings past `expiresAt` stop accepting offers (EXPIRED; history kept);
   * three days before, the publisher gets one reminder. Offers already accepted are untouched.
   */
  async processExpiries(now = new Date()): Promise<{ expired: number; warned: number }> {
    const live: SupportNeedStatus[] = [SupportNeedStatus.PUBLISHED, SupportNeedStatus.PARTIALLY_FULFILLED, SupportNeedStatus.PAUSED];
    const due = await this.prisma.supportNeedListing.findMany({ where: { status: { in: live }, expiresAt: { lte: now } }, select: { id: true, status: true }, take: 200 });
    let expired = 0;
    for (const row of due) {
      await this.prisma.$transaction(async (tx) => {
        const res = await tx.supportNeedListing.updateMany({ where: { id: row.id, status: row.status }, data: { status: SupportNeedStatus.EXPIRED } });
        if (res.count === 0) return;
        expired += 1;
        await this.events.publish("SupportNeedListingStatusChanged", { listingId: row.id, from: row.status, to: SupportNeedStatus.EXPIRED }, { tx, aggregateType: "SupportNeedListing", aggregateId: row.id });
      });
    }
    const soon = await this.prisma.supportNeedListing.findMany({
      where: { status: { in: ACCEPTING_OFFERS }, expiryWarnedAt: null, expiresAt: { gt: now, lte: new Date(now.getTime() + 3 * 86_400_000) } },
      select: { id: true, creatorUserId: true },
      take: 200,
    });
    let warned = 0;
    for (const row of soon) {
      await this.prisma.$transaction(async (tx) => {
        const res = await tx.supportNeedListing.updateMany({ where: { id: row.id, expiryWarnedAt: null }, data: { expiryWarnedAt: now } });
        if (res.count === 0) return;
        warned += 1;
        await this.events.publish("SupportNeedExpiringSoon", { listingId: row.id, publisherUserId: row.creatorUserId }, { tx, aggregateType: "SupportNeedListing", aggregateId: row.id });
      });
    }
    return { expired, warned };
  }

  /** Used by the admin moderation surface (see AdminSupportNeedService) to confirm an org exists and is verified before featuring its listings. */
  async isOrganizationVerified(organizationId: string): Promise<boolean> {
    const org = await this.prisma.animalSupportOrganization.findUnique({ where: { id: organizationId } });
    return org?.verificationStatus === AnimalSupportVerificationStatus.VERIFIED && org.isPubliclyListed;
  }
}
