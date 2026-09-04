import { Injectable } from "@nestjs/common";
import { CommunityPostType, CommunitySourceType, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { StorageService } from "../storage/storage.service";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { DonationLedgerService } from "./donation-ledger.service";
import { CommunityPostService } from "../community/community-post.service";
import { AnimalSupportOrganizationNotFoundException, SupportCampaignNotFoundException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import { toSupportCampaignDto, toSupportCampaignUpdateDto } from "./animal-support-mapper";
import type { CreateSupportCampaignDto, ListSupportCampaignsQueryDto, PostSupportCampaignUpdateDto, UpdateSupportCampaignStatusDto } from "./dto/animal-support.dto";

const CAMPAIGN_INCLUDE = { organization: { select: { name: true } } } satisfies Prisma.SupportCampaignInclude;

/**
 * Admin CRUD + status lifecycle + progress updates for SupportCampaign
 * (spec: "Create SupportCampaign... admin: approve/suspend campaigns").
 * `fundType` is set once at creation and never mutated by any method here
 * (spec: "restricted donations must remain restricted to their intended
 * purpose") — an org that wants a different fund type creates a new
 * campaign rather than reclassifying an existing one's past donations.
 */
@Injectable()
export class SupportCampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly storage: StorageService,
    private readonly audit: AdminAuditLogService,
    private readonly donationLedger: DonationLedgerService,
    private readonly communityPosts: CommunityPostService,
  ) {}

  private async getRawOrThrow(id: string) {
    const row = await this.prisma.supportCampaign.findUnique({ where: { id }, include: CAMPAIGN_INCLUDE });
    if (!row) throw new SupportCampaignNotFoundException({ campaignId: id });
    return row;
  }

  private async toDto(row: Prisma.SupportCampaignGetPayload<{ include: typeof CAMPAIGN_INCLUDE }>) {
    const raisedAmountIrr = await this.donationLedger.getCampaignRaisedIrr(row.id);
    return toSupportCampaignDto(row, raisedAmountIrr);
  }

  async adminList(query: ListSupportCampaignsQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.SupportCampaignWhereInput = { organizationId: query.organizationId, rescueCaseId: query.rescueCaseId, status: query.status };
    const [rows, total] = await Promise.all([
      this.prisma.supportCampaign.findMany({ where, include: CAMPAIGN_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.supportCampaign.count({ where }),
    ]);
    const items = await Promise.all(rows.map((row) => this.toDto(row)));
    return toPaginatedDto(items, total, page, pageSize);
  }

  async adminGet(id: string) {
    return this.toDto(await this.getRawOrThrow(id));
  }

  async create(admin: ResolvedAdminContext, organizationId: string, dto: CreateSupportCampaignDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const org = await tx.animalSupportOrganization.findUnique({ where: { id: organizationId } });
      if (!org) throw new AnimalSupportOrganizationNotFoundException({ organizationId });

      const created = await tx.supportCampaign.create({
        data: {
          organizationId,
          rescueCaseId: dto.rescueCaseId,
          title: dto.title,
          description: dto.description,
          fundType: dto.fundType,
          targetAmountIrr: dto.targetAmountIrr,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        },
        include: CAMPAIGN_INCLUDE,
      });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "support_campaign.created",
        entityType: "SupportCampaign",
        entityId: created.id,
        afterSummary: { organizationId, title: created.title, fundType: created.fundType },
        tx,
      });
      return created;
    });
    return this.toDto(row);
  }

  /** spec: "approve/suspend campaigns" — ACTIVE is what makes a campaign donatable (DonationService checks this same status). */
  async setStatus(admin: ResolvedAdminContext, id: string, dto: UpdateSupportCampaignStatusDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.supportCampaign.findUnique({ where: { id } });
      if (!existing) throw new SupportCampaignNotFoundException({ campaignId: id });
      const updated = await tx.supportCampaign.update({ where: { id }, data: { status: dto.status }, include: CAMPAIGN_INCLUDE });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "support_campaign.status_changed",
        entityType: "SupportCampaign",
        entityId: id,
        beforeSummary: { status: existing.status },
        afterSummary: { status: updated.status },
        tx,
      });
      if (updated.status === "ACTIVE") {
        await this.events.publish("SupportCampaignPublished", { campaignId: id, organizationId: updated.organizationId }, { tx, aggregateType: "SupportCampaign", aggregateId: id });
      }
      return updated;
    });
    return this.toDto(row);
  }

  /** spec: "public campaign should show ... updates ... use-of-funds updates where available" — admin-curated this phase (see model's own doc comment; no org-staff portal yet). */
  async postUpdate(admin: ResolvedAdminContext, campaignId: string, dto: PostSupportCampaignUpdateDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.supportCampaign.findUnique({ where: { id: campaignId } });
      if (!campaign) throw new SupportCampaignNotFoundException({ campaignId });

      const created = await tx.supportCampaignUpdate.create({
        data: { campaignId, title: dto.title, body: dto.body, evidenceObjectKeys: dto.evidenceObjectKeys ?? [], postedByAdminId: admin.adminUserId },
      });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "support_campaign.update_posted",
        entityType: "SupportCampaign",
        entityId: campaignId,
        afterSummary: { title: created.title },
        tx,
      });
      await this.events.publish("SupportCampaignUpdatePosted", { campaignId, campaignUpdateId: created.id }, { tx, aggregateType: "SupportCampaign", aggregateId: campaignId });
      return created;
    });
    return toSupportCampaignUpdateDto(row);
  }

  /**
   * spec: "Rescue campaigns may be shared into community. Again: Campaign
   * remains source of truth. Post is only presentation/distribution."
   * Admin-triggered only (there is no org-staff portal this phase — see
   * README "Known limitations") — the post is attributed to the admin's
   * own linked consumer identity, mirroring SupportCampaignUpdate's own
   * `postedByAdminId` attribution.
   */
  async shareToCommunity(admin: ResolvedAdminContext, campaignId: string) {
    const campaign = await this.getRawOrThrow(campaignId);
    const bodyParts = [campaign.description];
    if (campaign.targetAmountIrr) bodyParts.push(`Goal: ${campaign.targetAmountIrr.toLocaleString()} IRR`);

    return this.communityPosts.createSourcedPost(admin.userId, {
      type: CommunityPostType.RESCUE,
      title: campaign.title,
      body: bodyParts.join("\n\n"),
      sourceType: CommunitySourceType.SUPPORT_CAMPAIGN,
      sourceSupportCampaignId: campaignId,
    });
  }

  async listUpdates(campaignId: string) {
    await this.getRawOrThrow(campaignId);
    const rows = await this.prisma.supportCampaignUpdate.findMany({ where: { campaignId }, orderBy: { createdAt: "desc" } });
    return rows.map(toSupportCampaignUpdateDto);
  }

  async requestEvidenceUpload(campaignId: string, contentType: string, fileSizeBytes: number) {
    await this.getRawOrThrow(campaignId);
    return this.storage.createAnimalSupportEvidenceUploadTarget(campaignId, contentType, fileSizeBytes);
  }
}
