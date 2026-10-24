import { Injectable, Logger } from "@nestjs/common";
import { DonationStatus, HelpOfferStatus, Prisma, SupportNeedStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";

export const MILESTONE_KEYS = ["FUNDING_25", "FUNDING_50", "FUNDING_75", "FUNDING_100", "ITEM_RECEIVED", "NEED_COMPLETED"] as const;
export type MilestoneKey = (typeof MILESTONE_KEYS)[number];
/** Only these reach followers, donors and helpers — the rest stay on the need's timeline (no notification noise). */
const MAJOR: MilestoneKey[] = ["FUNDING_50", "FUNDING_100", "NEED_COMPLETED"];
const MAX_RECIPIENTS = 500;

/**
 * Cross-domain chain #5: contribution / help received / fulfilment → progress → milestone → timeline → notification.
 * `record()` derives milestones from committed state only and stores each (need, key) once — the unique index makes
 * the first writer the only one to emit, so concurrent donations can't double-announce. Callers invoke it after
 * their transaction commits (domain events are emitted before commit, so a listener would see stale totals).
 */
@Injectable()
export class SupportMilestoneService {
  private readonly logger = new Logger(SupportMilestoneService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly notifications: NotificationOrchestratorService,
  ) {}

  /** Never throws into the caller's flow: a milestone failure must not fail the donation or the offer. */
  async recordSafely(listingId: string | null | undefined) {
    if (!listingId) return [];
    try {
      return await this.record(listingId);
    } catch (error) {
      this.logger.error(`Milestone recording failed for ${listingId}`, error instanceof Error ? error.stack : undefined);
      return [];
    }
  }

  async record(listingId: string): Promise<MilestoneKey[]> {
    const listing = await this.prisma.supportNeedListing.findUnique({ where: { id: listingId }, select: { id: true, title: true, status: true, targetAmountIrr: true, organizationId: true, creatorUserId: true } });
    if (!listing) return [];
    const reached: MilestoneKey[] = [];
    if (listing.targetAmountIrr) {
      const sum = (await this.prisma.donationIntent.aggregate({ where: { supportNeedListingId: listingId, status: DonationStatus.SUCCEEDED }, _sum: { amountIrr: true } }))._sum.amountIrr ?? 0;
      for (const pct of [25, 50, 75, 100] as const) if (sum * 100 >= listing.targetAmountIrr * pct) reached.push(`FUNDING_${pct}` as MilestoneKey);
    }
    if (await this.prisma.helpOffer.count({ where: { listingId, status: HelpOfferStatus.COMPLETED } })) reached.push("ITEM_RECEIVED");
    if (listing.status === SupportNeedStatus.FULFILLED) reached.push("NEED_COMPLETED");

    const created: MilestoneKey[] = [];
    for (const key of reached) {
      try {
        await this.prisma.supportNeedMilestone.create({ data: { listingId, key } });
        created.push(key);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error; // already recorded
      }
    }
    for (const key of created) {
      await this.events.publish("SupportNeedMilestoneReached", { listingId, key, organizationId: listing.organizationId }, { aggregateType: "SupportNeedListing", aggregateId: listingId });
      if (MAJOR.includes(key)) await this.notify(listing, key);
    }
    return created;
  }

  /** Followers of the organisation, succeeded donors and accepted/completed helpers — once per milestone. */
  private async notify(listing: { id: string; title: string; organizationId: string | null; creatorUserId: string | null }, key: MilestoneKey) {
    const [followers, donors, helpers] = await Promise.all([
      listing.organizationId ? this.prisma.animalSupportOrgFollow.findMany({ where: { organizationId: listing.organizationId }, select: { userId: true } }) : [],
      this.prisma.donationIntent.findMany({ where: { supportNeedListingId: listing.id, status: DonationStatus.SUCCEEDED, donorUserId: { not: null } }, select: { donorUserId: true } }),
      this.prisma.helpOffer.findMany({ where: { listingId: listing.id, status: { in: [HelpOfferStatus.ACCEPTED, HelpOfferStatus.IN_PROGRESS, HelpOfferStatus.COMPLETED] } }, select: { helperUserId: true } }),
    ]);
    const recipients = [...new Set([...followers.map((f) => f.userId), ...donors.map((d) => d.donorUserId as string), ...helpers.map((h) => h.helperUserId)])].filter((u) => u !== listing.creatorUserId).slice(0, MAX_RECIPIENTS);
    for (const userId of recipients) {
      await this.notifications.notify({ userId, type: "animal_support.milestone", category: "ANIMAL_SUPPORT", deepLink: NotificationDeepLinks.supportNeed(listing.id), entityType: "SupportNeedMilestone", entityId: `${listing.id}:${key}`, templateParams: { title: listing.title, milestone: key } });
    }
  }

  async list(listingId: string) {
    const rows = await this.prisma.supportNeedMilestone.findMany({ where: { listingId }, orderBy: { reachedAt: "asc" } });
    return rows.map((m) => ({ key: m.key, at: m.reachedAt.toISOString() }));
  }
}
