import { Injectable } from "@nestjs/common";
import { AnimalSupportVerificationStatus, DonationStatus, HelpOfferStatus, Prisma, SupportNeedStatus, VolunteerInterestStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException, PetAccessDeniedException, ValidationApiException } from "../../common/errors/api-exception";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import { AnimalSupportOrgAccessService } from "./animal-support-org-access.service";

const VISIBLE: SupportNeedStatus[] = [SupportNeedStatus.PUBLISHED, SupportNeedStatus.PARTIALLY_FULFILLED, SupportNeedStatus.FULFILLED, SupportNeedStatus.PAUSED];
const MAX_UPDATE_RECIPIENTS = 500;
export const VOLUNTEER_KINDS = ["TRANSPORT", "TEMPORARY_FOSTER", "DELIVERY", "ON_SITE_HELP"] as const;

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
  ) {}

  // ---------------------------------------------------------------- updates

  async listUpdates(listingId: string) {
    await this.visibleListing(listingId);
    const rows = await this.prisma.supportNeedUpdate.findMany({ where: { listingId, removedAt: null }, orderBy: { createdAt: "desc" }, take: 50 });
    return rows.map((u) => ({ id: u.id, body: u.body, createdAt: u.createdAt.toISOString() }));
  }

  /**
   * Posted by the listing's managers. Reaches the people already involved — followers of the organisation, helpers
   * whose offers were accepted or completed, and donors to this need — through their notification preferences.
   */
  async postUpdate(userId: string, listingId: string, body: string) {
    const listing = await this.visibleListing(listingId);
    if (!(await this.orgAccess.canManageListing(userId, listing))) throw new PetAccessDeniedException({ listingId, reason: "NOT_LISTING_MANAGER" });
    const text = body.trim();
    if (!text) throw new ValidationApiException({ field: "body" });
    const update = await this.prisma.supportNeedUpdate.create({ data: { listingId, authorUserId: userId, body: text } });
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
    return { id: update.id, body: update.body, createdAt: update.createdAt.toISOString(), notified: recipients.length };
  }

  async removeUpdate(userId: string, listingId: string, updateId: string) {
    const listing = await this.prisma.supportNeedListing.findUnique({ where: { id: listingId } });
    if (!listing || !(await this.orgAccess.canManageListing(userId, listing))) throw new NotFoundApiException("SupportNeedUpdate");
    const done = await this.prisma.supportNeedUpdate.updateMany({ where: { id: updateId, listingId, removedAt: null }, data: { removedAt: new Date() } });
    if (!done.count) throw new NotFoundApiException("SupportNeedUpdate");
    return { removed: true };
  }

  // ---------------------------------------------------------------- milestones (derived)

  async milestones(listingId: string) {
    const listing = await this.visibleListing(listingId);
    const out: { key: string; at: string }[] = [];
    if (listing.targetAmountIrr) {
      const donations = await this.prisma.donationIntent.findMany({ where: { supportNeedListingId: listingId, status: DonationStatus.SUCCEEDED }, orderBy: { createdAt: "asc" }, select: { amountIrr: true, createdAt: true } });
      let sum = 0;
      let half = false;
      for (const d of donations) {
        sum += d.amountIrr;
        if (!half && sum * 2 >= listing.targetAmountIrr) { out.push({ key: "FUNDING_50", at: d.createdAt.toISOString() }); half = true; }
        if (sum >= listing.targetAmountIrr) { out.push({ key: "FUNDING_100", at: d.createdAt.toISOString() }); break; }
      }
    }
    const firstReceived = await this.prisma.helpOffer.findFirst({ where: { listingId, status: HelpOfferStatus.COMPLETED }, orderBy: { updatedAt: "asc" }, select: { updatedAt: true } });
    if (firstReceived) out.push({ key: "FIRST_HELP_RECEIVED", at: firstReceived.updatedAt.toISOString() });
    if (listing.fulfilledAt) out.push({ key: "FULFILLED", at: listing.fulfilledAt.toISOString() });
    if (listing.closedAt) out.push({ key: "CLOSED", at: listing.closedAt.toISOString() });
    return out.sort((a, b) => a.at.localeCompare(b.at));
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

  async registerInterest(userId: string, organizationId: string, input: { kinds: string[]; city: string; availability?: string; note?: string; shareContact?: boolean }) {
    const org = await this.prisma.animalSupportOrganization.findFirst({ where: { id: organizationId, verificationStatus: AnimalSupportVerificationStatus.VERIFIED, isPubliclyListed: true }, select: { id: true, name: true } });
    if (!org) throw new NotFoundApiException("AnimalSupportOrganization");
    const data = { kinds: input.kinds, city: input.city.trim(), availability: input.availability?.trim() || null, note: input.note?.trim() || null, shareContact: input.shareContact === true, status: VolunteerInterestStatus.NEW };
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

  async withdrawInterest(userId: string, organizationId: string) {
    const done = await this.prisma.volunteerInterest.deleteMany({ where: { userId, organizationId } });
    if (!done.count) throw new NotFoundApiException("VolunteerInterest");
    return { withdrawn: true };
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

  async setInterestStatus(organizationId: string, interestId: string, status: VolunteerInterestStatus) {
    const done = await this.prisma.volunteerInterest.updateMany({ where: { id: interestId, organizationId }, data: { status } });
    if (!done.count) throw new NotFoundApiException("VolunteerInterest");
    return this.orgInterests(organizationId);
  }

  // ---------------------------------------------------------------- helpers

  private async visibleListing(listingId: string) {
    const listing = await this.prisma.supportNeedListing.findFirst({ where: { id: listingId, status: { in: VISIBLE } } });
    if (!listing) throw new NotFoundApiException("SupportNeedListing");
    return listing;
  }
}

function toInterestDto(r: Prisma.VolunteerInterestGetPayload<object>, volunteer: Record<string, unknown> | null) {
  return { id: r.id, organizationId: r.organizationId, kinds: r.kinds, city: r.city, availability: r.availability, note: r.note, shareContact: r.shareContact, status: r.status, createdAt: r.createdAt.toISOString(), ...(volunteer ? { volunteer } : {}) };
}
