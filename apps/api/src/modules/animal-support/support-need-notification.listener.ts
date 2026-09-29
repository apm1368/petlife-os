import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationCategory, NotificationPriority } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { AnimalSupportOrgAccessService } from "./animal-support-org-access.service";

interface OfferEvent {
  listingId: string;
  offerId: string;
  status?: string;
  helperUserId?: string;
  publisherUserId?: string | null;
  byHelper?: boolean;
}

/**
 * Batch 6 — Animal Support notifications through the existing orchestrator (H10). Only
 * actionable moments: a new offer (publisher), the publisher's answer (helper), a helper
 * cancelling (publisher), progress milestones (publisher), a deadline reminder, and the
 * moderation outcome. Each links to the exact screen.
 */
@Injectable()
export class SupportNeedNotificationListener {
  private readonly logger = new Logger(SupportNeedNotificationListener.name);

  constructor(
    private readonly orchestrator: NotificationOrchestratorService,
    private readonly prisma: PrismaService,
    private readonly orgAccess: AnimalSupportOrgAccessService,
  ) {}

  /** The people who manage a listing: its creator plus, for an organization listing, the org's owners/coordinators. */
  private async managersOf(listingId: string): Promise<string[]> {
    const listing = await this.prisma.supportNeedListing.findUnique({ where: { id: listingId }, select: { creatorUserId: true, organizationId: true } });
    if (!listing) return [];
    const staff = listing.organizationId ? await this.orgAccess.managerUserIds(listing.organizationId) : [];
    return [...new Set([listing.creatorUserId, ...staff].filter((x): x is string => Boolean(x)))];
  }

  private async safely(label: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(`Notification handling failed for ${label}`, error instanceof Error ? error.stack : undefined);
    }
  }

  private async send(userId: string | null | undefined, type: string, listingId: string, deepLink: string, domainEventId: string, priority: NotificationPriority = NotificationPriority.NORMAL) {
    if (!userId) return;
    const listing = await this.prisma.supportNeedListing.findUnique({ where: { id: listingId }, select: { title: true } });
    await this.orchestrator.notify({
      userId,
      type,
      category: NotificationCategory.ANIMAL_SUPPORT,
      priority,
      templateParams: { title: listing?.title ?? "" },
      entityType: "SupportNeedListing",
      entityId: listingId,
      deepLink,
      domainEventId,
    });
  }

  @OnEvent("SupportNeedHelpOffered")
  onOffered(p: OfferEvent, domainEventId: string) {
    return this.safely("SupportNeedHelpOffered", async () => {
      for (const userId of await this.managersOf(p.listingId)) await this.send(userId, "animal_support.offer_received", p.listingId, NotificationDeepLinks.supportNeedManage(p.listingId), domainEventId);
    });
  }

  @OnEvent("SupportNeedHelpOfferResolved")
  onResolved(p: OfferEvent, domainEventId: string) {
    return this.safely("SupportNeedHelpOfferResolved", async () => {
      if (p.status === "CANCELLED" && p.byHelper) {
        for (const userId of await this.managersOf(p.listingId)) await this.send(userId, "animal_support.offer_cancelled", p.listingId, NotificationDeepLinks.supportNeedManage(p.listingId), domainEventId);
        return;
      }
      const type = { ACCEPTED: "animal_support.offer_accepted", DECLINED: "animal_support.offer_declined", IN_PROGRESS: "animal_support.offer_in_progress", COMPLETED: "animal_support.offer_completed", CANCELLED: "animal_support.offer_cancelled_by_publisher" }[p.status ?? ""];
      if (type) await this.send(p.helperUserId, type, p.listingId, NotificationDeepLinks.myHelpOffers(), domainEventId);
    });
  }

  @OnEvent("SupportNeedListingStatusChanged")
  onStatusChanged(p: { listingId: string; to: string }, domainEventId: string) {
    return this.safely("SupportNeedListingStatusChanged", async () => {
      const type = { PARTIALLY_FULFILLED: "animal_support.partially_fulfilled", FULFILLED: "animal_support.fulfilled", EXPIRED: "animal_support.expired" }[p.to];
      if (!type) return;
      for (const userId of await this.managersOf(p.listingId)) await this.send(userId, type, p.listingId, NotificationDeepLinks.supportNeedManage(p.listingId), domainEventId);
    });
  }

  @OnEvent("SupportNeedExpiringSoon")
  onExpiringSoon(p: { listingId: string; publisherUserId: string | null }, domainEventId: string) {
    return this.safely("SupportNeedExpiringSoon", async () => {
      await this.send(p.publisherUserId, "animal_support.expiring_soon", p.listingId, NotificationDeepLinks.supportNeedManage(p.listingId), domainEventId, NotificationPriority.HIGH);
    });
  }

  /** The donor's confirmation, linking to their private receipt. Organization notifications live with the NGO portal. */
  @OnEvent("DonationSucceeded")
  onDonation(p: { donationIntentId: string; campaignId: string; organizationId?: string }, domainEventId: string) {
    return this.safely("DonationSucceeded", async () => {
      if (p.organizationId) {
        const campaign = await this.prisma.supportCampaign.findUnique({ where: { id: p.campaignId }, select: { title: true } });
        for (const userId of await this.orgAccess.managerUserIds(p.organizationId)) {
          await this.orchestrator.notify({ userId, type: "animal_support.org_donation_received", category: NotificationCategory.ANIMAL_SUPPORT, templateParams: { title: campaign?.title ?? "" }, entityType: "DonationIntent", entityId: p.donationIntentId, deepLink: NotificationDeepLinks.ngoDonations(), domainEventId });
        }
      }
      const intent = await this.prisma.donationIntent.findUnique({ where: { id: p.donationIntentId }, select: { donorUserId: true, campaign: { select: { title: true } } } });
      if (!intent?.donorUserId) return;
      await this.orchestrator.notify({
        userId: intent.donorUserId,
        type: "animal_support.donation_received",
        category: NotificationCategory.ANIMAL_SUPPORT,
        templateParams: { title: intent.campaign.title },
        entityType: "DonationIntent",
        entityId: p.donationIntentId,
        deepLink: NotificationDeepLinks.donationReceipt(p.donationIntentId),
        domainEventId,
      });
    });
  }

  @OnEvent("AnimalSupportOrganizationVerificationChanged")
  onVerification(p: { organizationId: string; to: string }, domainEventId: string) {
    return this.safely("AnimalSupportOrganizationVerificationChanged", async () => {
      const owners = await this.prisma.animalSupportOrgMembership.findMany({ where: { organizationId: p.organizationId, isActive: true, role: "OWNER" }, select: { userId: true } });
      const org = await this.prisma.animalSupportOrganization.findUnique({ where: { id: p.organizationId }, select: { name: true } });
      for (const o of owners) {
        await this.orchestrator.notify({ userId: o.userId, type: "ngo.verification_updated", category: NotificationCategory.ANIMAL_SUPPORT, templateParams: { title: org?.name ?? "" }, entityType: "AnimalSupportOrganization", entityId: p.organizationId, deepLink: NotificationDeepLinks.ngoVerification(), domainEventId });
      }
    });
  }

  @OnEvent("SupportNeedListingModerated")
  onModerated(p: { listingId: string; to: string }, domainEventId: string) {
    return this.safely("SupportNeedListingModerated", async () => {
      const type = { PUBLISHED: "animal_support.listing_published", REJECTED: "animal_support.listing_rejected", REMOVED: "animal_support.listing_removed" }[p.to];
      if (!type) return;
      const listing = await this.prisma.supportNeedListing.findUnique({ where: { id: p.listingId }, select: { creatorUserId: true } });
      await this.send(listing?.creatorUserId, type, p.listingId, NotificationDeepLinks.supportNeedManage(p.listingId), domainEventId);
    });
  }
}
