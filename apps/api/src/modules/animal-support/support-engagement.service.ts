import { Injectable } from "@nestjs/common";
import { AnimalSupportVerificationStatus, DonationStatus, HelpOfferStatus, Prisma, SupportNeedStatus, VolunteerInterestStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException, PetAccessDeniedException, ValidationApiException } from "../../common/errors/api-exception";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import { AnimalSupportOrgAccessService } from "./animal-support-org-access.service";
import { SupportMilestoneService } from "./support-milestone.service";
import { resolveObjectUrls } from "../storage/object-url.util";

const VISIBLE: SupportNeedStatus[] = [SupportNeedStatus.PUBLISHED, SupportNeedStatus.PARTIALLY_FULFILLED, SupportNeedStatus.FULFILLED, SupportNeedStatus.PAUSED];
const MAX_UPDATE_RECIPIENTS = 500;
export const VOLUNTEER_KINDS = ["TRANSPORT", "TEMPORARY_FOSTER", "DELIVERY", "ON_SITE_HELP", "OTHER"] as const;
/** Organisation-driven volunteer transitions (the member can only cancel). Terminal: COMPLETED, CANCELLED, CLOSED. */
const VOLUNTEER_TRANSITIONS: Partial<Record<VolunteerInterestStatus, VolunteerInterestStatus[]>> = {
  INTERESTED: [VolunteerInterestStatus.CONTACTED, VolunteerInterestStatus.CANCELLED],
  CONTACTED: [VolunteerInterestStatus.ACCEPTED, VolunteerInterestStatus.CANCELLED],
  ACCEPTED: [VolunteerInterestStatus.COMPLETED, VolunteerInterestStatus.CANCELLED],
};
const OPEN_VOLUNTEER: VolunteerInterestStatus[] = [VolunteerInterestStatus.INTERESTED, VolunteerInterestStatus.CONTACTED, VolunteerInterestStatus.ACCEPTED];
const MAX_UPDATE_MEDIA = 4;

/**
 * Engagement around animal-support needs: progress updates by the listing's managers, milestones derived only from
 * real state (never stored or invented), following verified organisations, saving needs, and volunteer interest
 * (interest only; contact shared with the organisation only when the member opts in).
 */
@Injectable()
export class SupportEngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly orgAccess: AnimalSupportOrgAccessService,
    private readonly notifications: NotificationOrchestratorService,
    private readonly milestoneRecords: SupportMilestoneService,
  ) {}

  // ---------------------------------------------------------------- updates

  /** Newest first, cursor-paginated (cursor = the last item's id). Only for a visible need. */
  async listUpdates(listingId: string, cursor?: string, limit = 20) {
    await this.visibleListing(listingId);
    const take = Math.min(Math.max(limit, 1), 50);
    const after = cursor ? await this.prisma.supportNeedUpdate.findFirst({ where: { id: cursor, listingId }, select: { createdAt: true, id: true } }) : null;
    if (cursor && !after) throw new ValidationApiException({ field: "cursor" });
    const rows = await this.prisma.supportNeedUpdate.findMany({
      where: { listingId, removedAt: null, ...(after ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
    });
    const page = rows.slice(0, take);
    return { items: page.map(toUpdateDto), nextCursor: rows.length > take ? page[page.length - 1]!.id : null };
  }

  /**
   * Posted by the listing's managers. Reaches the people already involved — followers of the organisation, helpers
   * whose offers were accepted or completed, and donors to this need — through their notification preferences.
   */
  async postUpdate(userId: string, listingId: string, body: string, mediaObjectKeys: string[] = []) {
    const listing = await this.visibleListing(listingId);
    if (!(await this.orgAccess.canManageListing(userId, listing))) throw new PetAccessDeniedException({ listingId, reason: "NOT_LISTING_MANAGER" });
    const text = body.trim();
    if (!text) throw new ValidationApiException({ field: "body" });
    // Media: only images this manager uploaded through the support-need upload flow (no external URLs, no one else's files).
    if (mediaObjectKeys.length > MAX_UPDATE_MEDIA) throw new ValidationApiException({ field: "mediaObjectKeys", reason: "MAX_4" });
    if (mediaObjectKeys.some((k) => !k.startsWith(`support-need-images/${userId}/`))) throw new ValidationApiException({ field: "mediaObjectKeys", reason: "NOT_YOUR_UPLOAD" });
    const update = await this.prisma.supportNeedUpdate.create({ data: { listingId, authorUserId: userId, body: text, mediaObjectKeys } });
    await this.events.publish("SupportNeedUpdatePosted", { listingId, updateId: update.id, authorUserId: userId }, { aggregateType: "SupportNeedListing", aggregateId: listingId });
    const [followers, helpers, donors] = await Promise.all([
      listing.organizationId ? this.prisma.animalSupportOrgFollow.findMany({ where: { organizationId: listing.organizationId }, select: { userId: true } }) : [],
      this.prisma.helpOffer.findMany({ where: { listingId, status: { in: [HelpOfferStatus.ACCEPTED, HelpOfferStatus.IN_PROGRESS, HelpOfferStatus.COMPLETED] } }, select: { helperUserId: true } }),
      this.prisma.donationIntent.findMany({ where: { supportNeedListingId: listingId, status: DonationStatus.SUCCEEDED, donorUserId: { not: null } }, select: { donorUserId: true } }),
    ]);
    const recipients = [...new Set([...followers.map((f) => f.userId), ...helpers.map((h) => h.helperUserId), ...donors.map((d) => d.donorUserId as string)])].filter((u) => u !== userId).slice(0, MAX_UPDATE_RECIPIENTS);
    for (const recipient of recipients) {
      await this.notifications.notify({ userId: recipient, type: "animal_support.need_update", category: "ANIMAL_SUPPORT", deepLink: NotificationDeepLinks.supportNeed(listingId), entityType: "SupportNeedUpdate", entityId: update.id, templateParams: { title: listing.title } });
    }
    return { ...toUpdateDto(update), notified: recipients.length };
  }

  async removeUpdate(userId: string, listingId: string, updateId: string) {
    const listing = await this.prisma.supportNeedListing.findUnique({ where: { id: listingId } });
    if (!listing || !(await this.orgAccess.canManageListing(userId, listing))) throw new NotFoundApiException("SupportNeedUpdate");
    const done = await this.prisma.supportNeedUpdate.updateMany({ where: { id: updateId, listingId, removedAt: null }, data: { removedAt: new Date() } });
    if (!done.count) throw new NotFoundApiException("SupportNeedUpdate");
    return { removed: true };
  }

  // ---------------------------------------------------------------- milestones (derived)

  /** Recorded milestones (reconciled from real state on read — idempotent), oldest first. */
  async milestones(listingId: string) {
    await this.visibleListing(listingId);
    await this.milestoneRecords.recordSafely(listingId);
    return this.milestoneRecords.list(listingId);
  }

  /**
   * Public, anonymous timeline of a need: published, milestones, updates, items received, volunteers accepted,
   * completed. Never names a donor, helper or volunteer.
   */
  async activity(listingId: string) {
    const listing = await this.visibleListing(listingId);
    await this.milestoneRecords.recordSafely(listingId);
    const [milestones, updates, received, volunteers] = await Promise.all([
      this.milestoneRecords.list(listingId),
      this.prisma.supportNeedUpdate.findMany({ where: { listingId, removedAt: null }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, createdAt: true } }),
      this.prisma.helpOffer.findMany({ where: { listingId, status: HelpOfferStatus.COMPLETED }, orderBy: { updatedAt: "desc" }, take: 30, select: { updatedAt: true } }),
      this.prisma.volunteerInterest.findMany({ where: { listingId, status: { in: [VolunteerInterestStatus.ACCEPTED, VolunteerInterestStatus.COMPLETED] } }, select: { updatedAt: true } }),
    ]);
    const items = [
      ...(listing.publishedAt ? [{ kind: "NEED_PUBLISHED", at: listing.publishedAt.toISOString(), ref: null }] : []),
      ...milestones.filter((m) => m.key !== "NEED_COMPLETED").map((m) => ({ kind: "MILESTONE", at: m.at, ref: m.key })),
      ...updates.map((u) => ({ kind: "UPDATE_POSTED", at: u.createdAt.toISOString(), ref: u.id })),
      ...received.map((r) => ({ kind: "ITEM_RECEIVED", at: r.updatedAt.toISOString(), ref: null })),
      ...volunteers.map((v) => ({ kind: "VOLUNTEER_ACCEPTED", at: v.updatedAt.toISOString(), ref: null })),
      ...(listing.fulfilledAt ? [{ kind: "NEED_COMPLETED", at: listing.fulfilledAt.toISOString(), ref: null }] : []),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
  }

  // ---------------------------------------------------------------- follows & saved needs

  async follow(userId: string, organizationId: string, on: boolean) {
    if (on) {
      const org = await this.prisma.animalSupportOrganization.count({ where: { id: organizationId, verificationStatus: AnimalSupportVerificationStatus.VERIFIED, isPubliclyListed: true } });
      if (!org) throw new NotFoundApiException("AnimalSupportOrganization");
      await this.prisma.animalSupportOrgFollow.upsert({ where: { userId_organizationId: { userId, organizationId } }, create: { userId, organizationId }, update: {} });
    } else await this.prisma.animalSupportOrgFollow.deleteMany({ where: { userId, organizationId } });
    return { following: on };
  }

  async followedOrganizations(userId: string) {
    const rows = await this.prisma.animalSupportOrgFollow.findMany({ where: { userId }, include: { organization: { select: { id: true, name: true, type: true } } }, orderBy: { createdAt: "desc" } });
    return rows.map((r) => ({ ...r.organization, followedAt: r.createdAt.toISOString() }));
  }

  async save(userId: string, listingId: string, on: boolean) {
    if (on) {
      await this.visibleListing(listingId);
      await this.prisma.supportNeedBookmark.upsert({ where: { userId_listingId: { userId, listingId } }, create: { userId, listingId }, update: {} });
    } else await this.prisma.supportNeedBookmark.deleteMany({ where: { userId, listingId } });
    return { saved: on };
  }

  /** Saved needs that are still visible (a removed or rejected listing silently drops out). */
  async savedNeeds(userId: string) {
    const rows = await this.prisma.supportNeedBookmark.findMany({ where: { userId, listing: { status: { in: VISIBLE } } }, include: { listing: { select: { id: true, title: true, status: true, category: true, city: true, urgency: true } } }, orderBy: { createdAt: "desc" } });
    return rows.map((r) => ({ ...r.listing, savedAt: r.createdAt.toISOString() }));
  }

  // ---------------------------------------------------------------- volunteer interest

  async registerInterest(userId: string, organizationId: string, input: { kinds: string[]; city: string; availability?: string; note?: string; shareContact?: boolean; listingId?: string }) {
    const org = await this.prisma.animalSupportOrganization.findFirst({ where: { id: organizationId, verificationStatus: AnimalSupportVerificationStatus.VERIFIED, isPubliclyListed: true }, select: { id: true, name: true } });
    if (!org) throw new NotFoundApiException("AnimalSupportOrganization");
    if (input.listingId && !(await this.prisma.supportNeedListing.count({ where: { id: input.listingId, organizationId, status: { in: VISIBLE } } }))) throw new NotFoundApiException("SupportNeedListing");
    const existing = await this.prisma.volunteerInterest.findUnique({ where: { userId_organizationId: { userId, organizationId } } });
    // Editing details never resets the organisation's progress; a closed interest re-opens as INTERESTED.
    const status = existing && OPEN_VOLUNTEER.includes(existing.status) ? existing.status : VolunteerInterestStatus.INTERESTED;
    const data = { kinds: input.kinds, city: input.city.trim(), availability: input.availability?.trim() || null, note: input.note?.trim() || null, shareContact: input.shareContact === true, status, ...(input.listingId ? { listingId: input.listingId } : {}) };
    const row = await this.prisma.volunteerInterest.upsert({ where: { userId_organizationId: { userId, organizationId } }, create: { userId, organizationId, ...data }, update: data });
    for (const manager of await this.orgAccess.managerUserIds(organizationId)) {
      await this.notifications.notify({ userId: manager, type: "animal_support.volunteer_interest", category: "ANIMAL_SUPPORT", deepLink: NotificationDeepLinks.ngoPortal(), entityType: "VolunteerInterest", entityId: row.id, templateParams: { organization: org.name } });
    }
    return toInterestDto(row, null);
  }

  async myInterests(userId: string) {
    const rows = await this.prisma.volunteerInterest.findMany({ where: { userId }, include: { organization: { select: { id: true, name: true } } }, orderBy: { updatedAt: "desc" } });
    return rows.map((r) => ({ ...toInterestDto(r, null), organization: r.organization }));
  }

  /** The member cancels (history kept); only an open interest can be cancelled. */
  async withdrawInterest(userId: string, organizationId: string) {
    const row = await this.prisma.volunteerInterest.findUnique({ where: { userId_organizationId: { userId, organizationId } } });
    if (!row) throw new NotFoundApiException("VolunteerInterest");
    const done = await this.prisma.volunteerInterest.updateMany({ where: { id: row.id, status: { in: OPEN_VOLUNTEER } }, data: { status: VolunteerInterestStatus.CANCELLED } });
    if (!done.count) throw new ValidationApiException({ field: "status", reason: "NOT_OPEN", status: row.status });
    await this.events.publish("VolunteerInterestStatusChanged", { interestId: row.id, organizationId, from: row.status, to: VolunteerInterestStatus.CANCELLED, actorUserId: userId, byVolunteer: true }, { aggregateType: "VolunteerInterest", aggregateId: row.id });
    return { withdrawn: true, status: VolunteerInterestStatus.CANCELLED };
  }

  /** Organisation side: contact details only for volunteers who chose to share them. */
  async orgInterests(organizationId: string, status?: VolunteerInterestStatus) {
    const rows = await this.prisma.volunteerInterest.findMany({ where: { organizationId, ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" }, take: 200 });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, displayName: true, email: true, phone: true } });
    return rows.map((r) => {
      const u = users.find((x) => x.id === r.userId);
      return toInterestDto(r, { displayName: u?.displayName ?? null, ...(r.shareContact ? { email: u?.email ?? null, phone: u?.phone ?? null } : {}) });
    });
  }

  /** Explicit, audited transitions (INTERESTED → CONTACTED → ACCEPTED → COMPLETED; CANCELLED from any open state). */
  async setInterestStatus(organizationId: string, interestId: string, status: VolunteerInterestStatus, actorUserId?: string) {
    const row = await this.prisma.volunteerInterest.findFirst({ where: { id: interestId, organizationId } });
    if (!row) throw new NotFoundApiException("VolunteerInterest");
    if (!(VOLUNTEER_TRANSITIONS[row.status] ?? []).includes(status)) throw new ValidationApiException({ field: "status", reason: "INVALID_TRANSITION", from: row.status, to: status });
    const done = await this.prisma.volunteerInterest.updateMany({ where: { id: interestId, organizationId, status: row.status }, data: { status } });
    if (!done.count) throw new ValidationApiException({ field: "status", reason: "CHANGED_CONCURRENTLY" });
    await this.events.publish("VolunteerInterestStatusChanged", { interestId, organizationId, from: row.status, to: status, actorUserId: actorUserId ?? null, byVolunteer: false }, { aggregateType: "VolunteerInterest", aggregateId: interestId });
    if (status === VolunteerInterestStatus.CONTACTED || status === VolunteerInterestStatus.ACCEPTED || status === VolunteerInterestStatus.COMPLETED) {
      const org = await this.prisma.animalSupportOrganization.findUnique({ where: { id: organizationId }, select: { name: true } });
      await this.notifications.notify({ userId: row.userId, type: "animal_support.volunteer_status", category: "ANIMAL_SUPPORT", deepLink: NotificationDeepLinks.supportOrganization(organizationId), entityType: "VolunteerInterest", entityId: interestId, templateParams: { organization: org?.name ?? "", status } });
    }
    if (row.listingId && (status === VolunteerInterestStatus.ACCEPTED || status === VolunteerInterestStatus.COMPLETED)) await this.milestoneRecords.recordSafely(row.listingId);
    return this.orgInterests(organizationId);
  }

  // ---------------------------------------------------------------- helpers

  private async visibleListing(listingId: string) {
    const listing = await this.prisma.supportNeedListing.findFirst({ where: { id: listingId, status: { in: VISIBLE } } });
    if (!listing) throw new NotFoundApiException("SupportNeedListing");
    return listing;
  }
}

function toUpdateDto(u: Prisma.SupportNeedUpdateGetPayload<object>) {
  return { id: u.id, body: u.body, mediaObjectKeys: u.mediaObjectKeys, mediaUrls: resolveObjectUrls(u.mediaObjectKeys), createdAt: u.createdAt.toISOString(), updatedAt: u.updatedAt.toISOString() };
}

function toInterestDto(r: Prisma.VolunteerInterestGetPayload<object>, volunteer: Record<string, unknown> | null) {
  return { id: r.id, organizationId: r.organizationId, listingId: r.listingId, kinds: r.kinds, city: r.city, availability: r.availability, note: r.note, shareContact: r.shareContact, status: r.status, createdAt: r.createdAt.toISOString(), ...(volunteer ? { volunteer } : {}) };
}
