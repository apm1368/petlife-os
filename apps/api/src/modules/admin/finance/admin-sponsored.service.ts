import { Injectable } from "@nestjs/common";
import { LedgerAccountCode, Prisma, SponsoredCampaignStatus, SponsoredClickOutcome, SponsoredPlacement, WalletCreditSource } from "@prisma/client";
import type { AdminSponsoredCampaignDetailDto, AdminSponsoredCampaignDto, AdminSponsoredRateDto, PaginatedDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { SPONSORED_CLICK_REFERENCE, WalletService } from "../../commerce/payments/wallet.service";
import { WALLET_OWNER_SELECT, toWalletOwnerDto } from "../../commerce/payments/wallet-owner";
import { SponsoredService } from "../../sponsored/sponsored.service";
import { SponsoredRateService } from "../../sponsored/sponsored-rate.service";

const MAX_REFUND_BATCH = 200;
const RATE_MIN_IRR = 1_000;
const RATE_MAX_IRR = 10_000_000;

const CAMPAIGN_INCLUDE = {
  walletAccount: { select: WALLET_OWNER_SELECT },
  product: { select: { id: true, title: true, status: true, isDemoRecord: true, categoryId: true, category: { select: { parentId: true } }, supportsDog: true, supportsCat: true, media: { orderBy: { sortOrder: "asc" as const }, take: 1, select: { url: true } }, variants: { select: { offers: { where: { status: "ACTIVE" as const, moderationStatus: "APPROVED" as const }, select: { sellerOrganizationId: true, priceAmount: true } } } } } },
  sellerOrganization: { select: { id: true, name: true, verificationStatus: true } },
  providerOrganization: { select: { id: true, name: true, type: true, logoUrl: true, verificationStatus: true, isDemoRecord: true, locations: { select: { city: true }, take: 1 } } },
} satisfies Prisma.SponsoredCampaignInclude;

/**
 * Staff side of sponsored listings: every campaign with its spend, a staff hold (never served until released) or a
 * final stop, crediting back clicks staff judge invalid, and the flat price per click (an effective-dated history).
 * Holds, stops and the price need their own permissions; crediting money back needs wallet.adjust. All audited.
 */
@Injectable()
export class AdminSponsoredService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly wallet: WalletService,
    private readonly sponsored: SponsoredService,
    private readonly rates: SponsoredRateService,
  ) {}

  private async toDtos(rows: Prisma.SponsoredCampaignGetPayload<{ include: typeof CAMPAIGN_INCLUDE }>[]): Promise<AdminSponsoredCampaignDto[]> {
    const dtos = await this.sponsored.toCampaignDtos(rows as never);
    return dtos.map((d, i) => ({ ...d, owner: toWalletOwnerDto(rows[i]!.walletAccount) }));
  }

  async list(query: { status?: SponsoredCampaignStatus; placement?: SponsoredPlacement; q?: string; page: number; pageSize: number }): Promise<PaginatedDto<AdminSponsoredCampaignDto>> {
    const q = query.q?.trim();
    const where: Prisma.SponsoredCampaignWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.placement ? { placement: query.placement } : {}),
      ...(q
        ? { OR: [{ product: { title: { contains: q, mode: "insensitive" } } }, { sellerOrganization: { name: { contains: q, mode: "insensitive" } } }, { providerOrganization: { name: { contains: q, mode: "insensitive" } } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.sponsoredCampaign.findMany({ where, include: CAMPAIGN_INCLUDE, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.sponsoredCampaign.count({ where }),
    ]);
    return { items: await this.toDtos(rows), total, page: query.page, pageSize: query.pageSize };
  }

  async detail(id: string): Promise<AdminSponsoredCampaignDetailDto> {
    const row = await this.prisma.sponsoredCampaign.findUnique({ where: { id }, include: CAMPAIGN_INCLUDE });
    if (!row) throw new NotFoundApiException("Sponsored campaign");
    const clicks = await this.prisma.sponsoredClick.findMany({ where: { campaignId: id }, orderBy: { clickedAt: "desc" }, take: 200 });
    return {
      campaign: (await this.toDtos([row]))[0]!,
      clicks: clicks.map((c) => ({
        id: c.id,
        clickedAt: c.clickedAt.toISOString(),
        outcome: c.outcome,
        costIrr: c.costIrr,
        rateIrr: c.rateIrr,
        viewer: c.personalDataErasedAt ? "ERASED" : c.viewerUserId ? "SIGNED_IN" : "ANONYMOUS",
        invalidatedAt: c.invalidatedAt?.toISOString() ?? null,
        invalidReason: c.invalidReason,
      })),
    };
  }

  /** Hold (never served until released), release, or stop for good. */
  async moderate(admin: ResolvedAdminContext, id: string, action: "hold" | "release" | "stop", reason: string | undefined, requestId?: string): Promise<AdminSponsoredCampaignDto> {
    const why = reason?.trim() ?? "";
    if (action !== "release" && why.length < 5) throw new ValidationApiException({ field: "reason", reason: "REQUIRED" });
    const row = await this.prisma.$transaction(async (tx) => {
      const before = await tx.sponsoredCampaign.findUnique({ where: { id } });
      if (!before) throw new NotFoundApiException("Sponsored campaign");
      if (before.status === SponsoredCampaignStatus.STOPPED) throw new ValidationApiException({ field: "campaign", reason: "STOPPED" });
      const data: Prisma.SponsoredCampaignUpdateInput =
        action === "hold" ? { staffHeldAt: new Date(), staffHoldReason: why }
        : action === "release" ? { staffHeldAt: null, staffHoldReason: null }
        : { status: SponsoredCampaignStatus.STOPPED, stoppedAt: new Date(), stoppedReason: `STAFF: ${why}` };
      const updated = await tx.sponsoredCampaign.update({ where: { id }, data, include: CAMPAIGN_INCLUDE });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: action === "hold" ? "sponsored.campaign_held" : action === "release" ? "sponsored.campaign_released" : "sponsored.campaign_stopped",
        entityType: "SponsoredCampaign", entityId: id, reason: why || undefined,
        beforeSummary: { status: before.status, staffHeld: !!before.staffHeldAt },
        afterSummary: { status: updated.status, staffHeld: !!updated.staffHeldAt },
        requestId, tx,
      });
      return updated;
    });
    this.sponsored.clearCache();
    return (await this.toDtos([row]))[0]!;
  }

  /**
   * Marks billed clicks invalid and credits each cost back to the wallet that paid it (into the same bucket), with a
   * balanced ledger transaction against CPC revenue. A click is credited at most once; the batch is all-or-nothing.
   */
  async refundClicks(admin: ResolvedAdminContext, clickIds: string[], reason: string, requestId?: string): Promise<{ refunded: number; amountIrr: number }> {
    const why = reason?.trim() ?? "";
    if (why.length < 5) throw new ValidationApiException({ field: "reason", reason: "REQUIRED" });
    const ids = [...new Set(clickIds)];
    if (!ids.length || ids.length > MAX_REFUND_BATCH) throw new ValidationApiException({ field: "clickIds", reason: "OUT_OF_RANGE", max: MAX_REFUND_BATCH });
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sponsored_clicks WHERE id = ANY(${ids}::uuid[]) FOR UPDATE`;
      const clicks = await tx.sponsoredClick.findMany({ where: { id: { in: ids } }, include: { campaign: { select: { walletAccountId: true } } } });
      if (clicks.length !== ids.length) throw new ValidationApiException({ field: "clickIds", reason: "NOT_FOUND" });
      const bad = clicks.filter((c) => c.outcome !== SponsoredClickOutcome.BILLED || c.creditEntryId);
      if (bad.length) throw new ValidationApiException({ field: "clickIds", reason: "NOT_REFUNDABLE", clickIds: bad.map((c) => c.id) });
      let amount = 0;
      for (const c of clicks) {
        const debit = await tx.walletEntry.findUniqueOrThrow({ where: { id: c.walletEntryId! } });
        await this.wallet.lockAccountById(c.campaign.walletAccountId, tx);
        const credit = await this.wallet.creditEntry({
          walletAccountId: c.campaign.walletAccountId, balanceType: debit.balanceType, amount: c.costIrr, source: WalletCreditSource.REFUND,
          referenceType: `${SPONSORED_CLICK_REFERENCE}_REFUND`, referenceId: c.id, debitAccount: LedgerAccountCode.CPC_REVENUE,
        }, tx);
        await tx.sponsoredClick.update({ where: { id: c.id }, data: { invalidatedAt: new Date(), invalidatedByAdminId: admin.adminUserId, invalidReason: why, creditEntryId: credit.entryId } });
        amount += c.costIrr;
      }
      await this.audit.record({
        adminUserId: admin.adminUserId, action: "sponsored.clicks_refunded", entityType: "SponsoredClick", entityId: ids[0]!, reason: why,
        afterSummary: { clickIds: ids, refunded: ids.length, amountIrr: amount, campaignIds: [...new Set(clicks.map((c) => c.campaignId))] },
        requestId, tx,
      });
      return { refunded: ids.length, amountIrr: amount };
    });
  }

  async rate(): Promise<AdminSponsoredRateDto> {
    const rows = await this.prisma.sponsoredCpcRate.findMany({ orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }], take: 50, include: { setByAdmin: { select: { user: { select: { displayName: true } } } } } });
    return {
      ...(await this.rates.overview()),
      history: rows.map((r) => ({ id: r.id, rateIrr: r.rateIrr, effectiveFrom: r.effectiveFrom.toISOString(), reason: r.reason, setBy: r.setByAdmin.user.displayName, createdAt: r.createdAt.toISOString() })),
    };
  }

  /** A new flat price from `effectiveFrom` (now or later). Never edits an earlier price. */
  async setRate(admin: ResolvedAdminContext, input: { rateIrr: number; effectiveFrom?: string; reason: string }, requestId?: string): Promise<AdminSponsoredRateDto> {
    const why = input.reason?.trim() ?? "";
    if (why.length < 5) throw new ValidationApiException({ field: "reason", reason: "REQUIRED" });
    if (!Number.isInteger(input.rateIrr) || input.rateIrr < RATE_MIN_IRR || input.rateIrr > RATE_MAX_IRR) throw new ValidationApiException({ field: "rateIrr", reason: "OUT_OF_RANGE", min: RATE_MIN_IRR, max: RATE_MAX_IRR });
    const now = new Date();
    const from = input.effectiveFrom ? new Date(input.effectiveFrom) : now;
    if (Number.isNaN(from.getTime()) || from.getTime() < now.getTime() - 60_000) throw new ValidationApiException({ field: "effectiveFrom", reason: "NOT_IN_THE_PAST" });
    const before = await this.rates.overview(now);
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.sponsoredCpcRate.create({ data: { rateIrr: input.rateIrr, effectiveFrom: from, reason: why, setByAdminId: admin.adminUserId } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "sponsored.rate_set", entityType: "SponsoredCpcRate", entityId: row.id, reason: why, beforeSummary: before, afterSummary: { rateIrr: input.rateIrr, effectiveFrom: from.toISOString() }, requestId, tx });
    });
    this.rates.invalidate();
    this.sponsored.clearCache();
    return this.rate();
  }
}
