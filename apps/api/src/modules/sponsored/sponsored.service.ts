import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "node:crypto";
import {
  AdminMembershipStatus,
  LedgerAccountCode,
  NotificationCategory,
  NotificationPriority,
  Prisma,
  ProductStatus,
  SellerOfferModerationStatus,
  SellerOfferStatus,
  SponsoredCampaignStatus,
  SponsoredClickOutcome,
  SponsoredPlacement,
  WalletOwnerType,
} from "@prisma/client";
import {
  SPONSORED_SLOTS_PER_LIST,
  type SponsoredCampaignDto,
  type SponsoredCampaignInput,
  type SponsoredNotServingReason,
  type SponsoredOverviewDto,
  type SponsoredSlotDto,
  type SponsoredStatsDto,
  type SponsoredTargetDto,
} from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import type { AppEnv } from "../../config/env";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { WalletService, SPONSORED_CLICK_REFERENCE } from "../commerce/payments/wallet.service";
import { ownerIsVerified, walletPeople, type WalletAccountWithOwner } from "../commerce/payments/wallet-owner";
import { SponsoredRateService } from "./sponsored-rate.service";
import {
  SERVICE_CATEGORY_TYPES,
  SERVICE_PROVIDER_TYPES,
  SPONSORED_CLICK_PERSONAL_DATA_DAYS,
  SPONSORED_LOCALES,
  SPONSORED_MAX_CPC_CEILING_IRR,
  SPONSORED_MAX_DAILY_BUDGET_IRR,
  VET_PROVIDER_TYPES,
  hashIp,
  looksAutomated,
  tehranDay,
} from "./sponsored-policy";

const SLOT_CACHE_MS = 30_000;
const CANDIDATES = 60;
const ERASE_EVERY_MS = 60 * 60 * 1000;

const CAMPAIGN_INCLUDE = {
  product: {
    select: {
      id: true, title: true, status: true, isDemoRecord: true, categoryId: true, category: { select: { parentId: true } }, supportsDog: true, supportsCat: true,
      media: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
      variants: { select: { offers: { where: { status: SellerOfferStatus.ACTIVE, moderationStatus: SellerOfferModerationStatus.APPROVED }, select: { sellerOrganizationId: true, priceAmount: true } } } },
    },
  },
  sellerOrganization: { select: { id: true, name: true, verificationStatus: true } },
  providerOrganization: { select: { id: true, name: true, type: true, logoUrl: true, verificationStatus: true, isDemoRecord: true, locations: { select: { city: true }, take: 1 } } },
} satisfies Prisma.SponsoredCampaignInclude;
type CampaignRow = Prisma.SponsoredCampaignGetPayload<{ include: typeof CAMPAIGN_INCLUDE }>;

export interface SlotContext {
  /** Shop: a product category id (its own products and its direct sub-categories'). */
  category?: string;
  /** Shop: DOG or CAT. */
  species?: string;
  /** Services: the directory's category code (GROOMING, …). */
  serviceCategory?: string;
  /** Vets / services: a city name as the list uses it. */
  city?: string;
}

export interface ClickInput {
  locale: string;
  viewerUserId?: string;
  ip?: string;
  userAgent?: string;
  headers: Record<string, string | string[] | undefined>;
}

/** The seller's lowest current price for a product, or null when it has no live offer. */
function sellerPrice(row: CampaignRow): number | null {
  const prices = (row.product?.variants ?? []).flatMap((v) => v.offers).filter((o) => o.sellerOrganizationId === row.sellerOrganizationId).map((o) => o.priceAmount);
  return prices.length ? Math.min(...prices) : null;
}

/** Whether the promoted listing itself can be shown (live product with this seller's offer / verified provider). */
function listingLive(row: CampaignRow): boolean {
  if (row.placement === SponsoredPlacement.SHOP) {
    return !!row.product && row.product.status === ProductStatus.ACTIVE && !row.product.isDemoRecord && row.sellerOrganization?.verificationStatus === "VERIFIED" && sellerPrice(row) !== null;
  }
  return !!row.providerOrganization && row.providerOrganization.verificationStatus === "VERIFIED" && !row.providerOrganization.isDemoRecord;
}

const emptyStats = (): SponsoredStatsDto => ({ spentIrr: 0, billedClicks: 0, freeClicks: 0, refundedIrr: 0 });

/**
 * Sponsored listings billed per click (owner #2; F-10, T-01, P-01, S-02, P-03):
 * - one flat price per billable click for everyone (SponsoredRateService), prepaid from the partner organisation's
 *   business wallet, within the partner's daily budget; a partner's "max per click" is only a ceiling — above it the
 *   campaign is simply not shown;
 * - at most SPONSORED_SLOTS_PER_LIST sponsored items, in their own labelled block above a list; organic results are
 *   never reordered; targeting uses only the list's own context (category, species, city), never a member profile;
 * - every click goes through our redirect and is logged; at most one billed click per listing per Tehran day per
 *   signed-in viewer and per IP (keyed hash, never the raw IP); the partner's own team, staff and bots are never
 *   billed; staff can mark billed clicks invalid and credit them back (AdminSponsoredService).
 * Switched off as a whole by the `sponsored.enabled` setting.
 */
@Injectable()
export class SponsoredService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SponsoredService.name);
  private slotCache = new Map<string, { at: number; slots: SponsoredSlotDto[] }>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly settings: PlatformSettingsService,
    private readonly wallet: WalletService,
    private readonly rates: SponsoredRateService,
    private readonly notifications: NotificationOrchestratorService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== "test") this.timer = setInterval(() => void this.erasePersonalData().catch((e) => this.logger.error("Sponsored click clean-up failed", e instanceof Error ? e.stack : undefined)), ERASE_EVERY_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  enabled(): boolean {
    return this.settings.get<boolean>("sponsored.enabled") !== false;
  }

  // ------------------------------------------------------------------ serving

  /** Up to SPONSORED_SLOTS_PER_LIST eligible sponsored items for one list, in random order (fair rotation). */
  async slots(placement: SponsoredPlacement, context: SlotContext): Promise<SponsoredSlotDto[]> {
    if (!this.enabled()) return [];
    const key = JSON.stringify([placement, context.category ?? "", context.species ?? "", context.serviceCategory ?? "", (context.city ?? "").trim().toLowerCase()]);
    const cached = this.slotCache.get(key);
    if (cached && Date.now() - cached.at < SLOT_CACHE_MS) return cached.slots;
    const slots = await this.computeSlots(placement, context);
    if (this.slotCache.size > 500) this.slotCache.clear();
    this.slotCache.set(key, { at: Date.now(), slots });
    return slots;
  }

  private async computeSlots(placement: SponsoredPlacement, context: SlotContext): Promise<SponsoredSlotDto[]> {
    const now = new Date();
    const rate = await this.rates.rateAt(now);
    const where: Prisma.SponsoredCampaignWhereInput = { placement, status: SponsoredCampaignStatus.ACTIVE, staffHeldAt: null, maxCpcIrr: { gte: rate }, dailyBudgetIrr: { gte: rate } };
    if (placement === SponsoredPlacement.SHOP) {
      const product: Prisma.ProductWhereInput = { status: ProductStatus.ACTIVE };
      if (context.category) product.OR = [{ categoryId: context.category }, { category: { parentId: context.category } }];
      if (context.species === "DOG") product.supportsDog = true;
      if (context.species === "CAT") product.supportsCat = true;
      where.product = product;
    } else {
      const types = placement === SponsoredPlacement.VETS ? VET_PROVIDER_TYPES : context.serviceCategory && SERVICE_CATEGORY_TYPES[context.serviceCategory] ? SERVICE_CATEGORY_TYPES[context.serviceCategory]! : SERVICE_PROVIDER_TYPES;
      const provider: Prisma.ProviderOrganizationWhereInput = { type: { in: types }, verificationStatus: "VERIFIED", isDemoRecord: false };
      if (context.city?.trim()) provider.locations = { some: { city: { equals: context.city.trim(), mode: "insensitive" } } };
      where.providerOrganization = provider;
    }
    const candidates = (await this.prisma.sponsoredCampaign.findMany({ where, include: CAMPAIGN_INCLUDE, take: CANDIDATES, orderBy: { createdAt: "asc" } })).filter(listingLive);
    if (!candidates.length) return [];
    const day = tehranDay(now);
    const spent = await this.prisma.sponsoredClick.groupBy({ by: ["campaignId"], where: { campaignId: { in: candidates.map((c) => c.id) }, day, outcome: SponsoredClickOutcome.BILLED }, _sum: { costIrr: true } });
    const spentBy = new Map(spent.map((s) => [s.campaignId, s._sum.costIrr ?? 0]));
    const eligible: CampaignRow[] = [];
    for (const c of candidates) {
      if ((spentBy.get(c.id) ?? 0) + rate > c.dailyBudgetIrr) continue;
      const b = await this.wallet.balancesOf(c.walletAccountId);
      if (b.PURCHASE_ONLY < rate && b.WITHDRAWABLE < rate) continue;
      eligible.push(c);
    }
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j]!, eligible[i]!];
    }
    return eligible.slice(0, SPONSORED_SLOTS_PER_LIST).map((c) => this.toSlot(c));
  }

  private toSlot(c: CampaignRow): SponsoredSlotDto {
    if (c.placement === SponsoredPlacement.SHOP) {
      return { campaignId: c.id, placement: c.placement, kind: "PRODUCT", title: c.product!.title, subtitle: c.sellerOrganization?.name ?? null, imageUrl: c.product!.media[0]?.url ?? null, priceIrr: sellerPrice(c), clickPath: `/sponsored/c/${c.id}` };
    }
    const p = c.providerOrganization!;
    return { campaignId: c.id, placement: c.placement, kind: "PROVIDER", title: p.name, subtitle: p.locations[0]?.city ?? null, imageUrl: p.logoUrl, priceIrr: null, clickPath: `/sponsored/c/${c.id}` };
  }

  /** Where a click on this campaign lands on the website (computed here, never taken from the request). */
  private targetUrl(c: { placement: SponsoredPlacement; productId: string | null; providerOrganizationId: string | null }, locale: string): string {
    const origin = this.config.get("WEB_APP_ORIGIN", { infer: true }).split(",")[0]!.trim().replace(/\/$/, "");
    const lang = (SPONSORED_LOCALES as readonly string[]).includes(locale) ? locale : "fa";
    if (c.placement === SponsoredPlacement.SHOP) return `${origin}/${lang}/shop/products/${c.productId}`;
    if (c.placement === SponsoredPlacement.VETS) return `${origin}/${lang}/vet/${c.providerOrganizationId}`;
    return `${origin}/${lang}/providers/${c.providerOrganizationId}`;
  }

  /**
   * A click on a sponsored card: decide whether it is billable, bill it (or log why not) and return where to send the
   * visitor. The decision for billable clicks runs under the paying wallet's lock, so the one-billed-click rule, the
   * daily budget and the balance check cannot race.
   */
  async click(campaignId: string, input: ClickInput): Promise<string | null> {
    const campaign = await this.prisma.sponsoredCampaign.findUnique({ where: { id: campaignId }, include: CAMPAIGN_INCLUDE });
    if (!campaign) return null;
    const target = this.targetUrl(campaign, input.locale);
    const now = new Date();
    const day = tehranDay(now);
    const rate = await this.rates.rateAt(now);
    const viewerUserId = input.viewerUserId ?? null;
    const ipHash = hashIp(this.config.get("SESSION_SECRET", { infer: true }), input.ip);

    let outcome: SponsoredClickOutcome | null = null;
    if (!this.enabled() || campaign.status !== SponsoredCampaignStatus.ACTIVE || campaign.staffHeldAt || !listingLive(campaign)) outcome = SponsoredClickOutcome.INACTIVE;
    else if (looksAutomated(input.userAgent, input.headers)) outcome = SponsoredClickOutcome.BOT;
    else if (viewerUserId && (await this.prisma.adminUser.count({ where: { userId: viewerUserId, status: AdminMembershipStatus.ACTIVE } }))) outcome = SponsoredClickOutcome.STAFF;
    else if (viewerUserId && (await walletPeople(this.prisma, this.ownerOf(campaign), true)).includes(viewerUserId)) outcome = SponsoredClickOutcome.SELF;
    else if (rate > campaign.maxCpcIrr) outcome = SponsoredClickOutcome.ABOVE_CEILING;

    const clickId = randomUUID();
    const decided: SponsoredClickOutcome = await this.prisma.$transaction(async (tx) => {
      let cost = 0;
      let walletEntryId: string | null = null;
      if (!outcome) {
        await this.wallet.lockAccountById(campaign.walletAccountId, tx);
        const same = [viewerUserId ? { viewerUserId } : null, ipHash ? { ipHash } : null].filter((x): x is NonNullable<typeof x> => !!x);
        const duplicate = same.length ? await tx.sponsoredClick.findFirst({ where: { campaignId, day, outcome: SponsoredClickOutcome.BILLED, OR: same }, select: { id: true } }) : null;
        if (duplicate) outcome = SponsoredClickOutcome.DUPLICATE;
        else {
          const spent = (await tx.sponsoredClick.aggregate({ where: { campaignId, day, outcome: SponsoredClickOutcome.BILLED }, _sum: { costIrr: true } }))._sum.costIrr ?? 0;
          if (spent + rate > campaign.dailyBudgetIrr) outcome = SponsoredClickOutcome.OVER_BUDGET;
          else {
            const debit = await this.wallet.debitForService({ walletAccountId: campaign.walletAccountId, amount: rate, referenceType: SPONSORED_CLICK_REFERENCE, referenceId: clickId, creditAccount: LedgerAccountCode.CPC_REVENUE, description: "Sponsored listing click" }, tx);
            if (!debit) outcome = SponsoredClickOutcome.NO_FUNDS;
            else {
              outcome = SponsoredClickOutcome.BILLED;
              cost = rate;
              walletEntryId = debit.entryId;
            }
          }
        }
      }
      const final: SponsoredClickOutcome = outcome ?? SponsoredClickOutcome.INACTIVE;
      await tx.sponsoredClick.create({ data: { id: clickId, campaignId, day, outcome: final, costIrr: cost, rateIrr: rate, viewerUserId, ipHash, walletEntryId } });
      return final;
    });
    if (decided === SponsoredClickOutcome.BILLED) this.slotCache.clear();
    if (decided === SponsoredClickOutcome.NO_FUNDS) await this.noticeOutOfFunds(campaign, day);
    return target;
  }

  private ownerOf(c: { sellerOrganizationId: string | null; providerOrganizationId: string | null }) {
    return c.sellerOrganizationId
      ? { ownerType: WalletOwnerType.SELLER, userId: null, sellerOrganizationId: c.sellerOrganizationId, providerOrganizationId: null }
      : { ownerType: WalletOwnerType.PROVIDER, userId: null, sellerOrganizationId: null, providerOrganizationId: c.providerOrganizationId };
  }

  /** S-02: when the wallet can no longer pay, the organisation's wallet managers hear it (once per campaign per day). */
  private async noticeOutOfFunds(c: CampaignRow, day: Date): Promise<void> {
    try {
      const name = c.placement === SponsoredPlacement.SHOP ? c.product?.title ?? "—" : c.providerOrganization?.name ?? "—";
      for (const userId of await walletPeople(this.prisma, this.ownerOf(c))) {
        await this.notifications.notify({
          userId, type: "sponsored.out_of_funds", category: NotificationCategory.PAYMENT, priority: NotificationPriority.HIGH,
          templateParams: { listing: name }, deepLink: `/profile/wallet/business/${c.walletAccountId}`, entityType: "SponsoredCampaign", entityId: c.id,
          domainEventId: stableUuid(`sponsored-out-of-funds:${c.id}:${day.toISOString().slice(0, 10)}:${userId}`),
        });
      }
    } catch (error) {
      this.logger.error(`Out-of-funds notice for campaign ${c.id} failed`, error instanceof Error ? error.stack : undefined);
    }
  }

  /** Erases the viewer account and IP hash on clicks older than the personal-data window. */
  async erasePersonalData(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - SPONSORED_CLICK_PERSONAL_DATA_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.sponsoredClick.updateMany({ where: { clickedAt: { lt: before }, personalDataErasedAt: null }, data: { viewerUserId: null, ipHash: null, personalDataErasedAt: now } });
    return count;
  }

  // ------------------------------------------------------------------ partner side

  /** Campaigns of one business wallet with their spend; the caller checked the member manages it. */
  async overview(account: WalletAccountWithOwner): Promise<SponsoredOverviewDto> {
    const campaigns = await this.prisma.sponsoredCampaign.findMany({ where: { walletAccountId: account.id }, include: CAMPAIGN_INCLUDE, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 });
    return { enabled: this.enabled(), verified: ownerIsVerified(account), rate: await this.rates.overview(), campaigns: await this.toCampaignDtos(campaigns) };
  }

  async toCampaignDtos(rows: CampaignRow[]): Promise<SponsoredCampaignDto[]> {
    if (!rows.length) return [];
    const now = new Date();
    const day = tehranDay(now);
    const rate = await this.rates.rateAt(now);
    const ids = rows.map((r) => r.id);
    const [todayRows, totalRows, refunds] = await Promise.all([
      this.prisma.sponsoredClick.groupBy({ by: ["campaignId", "outcome"], where: { campaignId: { in: ids }, day }, _sum: { costIrr: true }, _count: { _all: true } }),
      this.prisma.sponsoredClick.groupBy({ by: ["campaignId", "outcome"], where: { campaignId: { in: ids } }, _sum: { costIrr: true }, _count: { _all: true } }),
      this.prisma.sponsoredClick.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids }, creditEntryId: { not: null } }, _sum: { costIrr: true } }),
    ]);
    const fold = (groups: typeof todayRows) => {
      const map = new Map<string, SponsoredStatsDto>();
      for (const g of groups) {
        const s = map.get(g.campaignId) ?? emptyStats();
        if (g.outcome === SponsoredClickOutcome.BILLED) {
          s.spentIrr += g._sum.costIrr ?? 0;
          s.billedClicks += g._count._all;
        } else s.freeClicks += g._count._all;
        map.set(g.campaignId, s);
      }
      return map;
    };
    const today = fold(todayRows);
    const total = fold(totalRows);
    for (const r of refunds) {
      const s = total.get(r.campaignId) ?? emptyStats();
      s.refundedIrr = r._sum.costIrr ?? 0;
      total.set(r.campaignId, s);
    }
    const out: SponsoredCampaignDto[] = [];
    for (const r of rows) {
      const t = today.get(r.id) ?? emptyStats();
      let reason: SponsoredNotServingReason | null = null;
      if (r.status === SponsoredCampaignStatus.STOPPED) reason = "STOPPED";
      else if (r.staffHeldAt) reason = "STAFF_HOLD";
      else if (r.status === SponsoredCampaignStatus.PAUSED) reason = "PAUSED";
      else if (!this.enabled()) reason = "SWITCHED_OFF";
      else if ((r.sellerOrganization ?? r.providerOrganization)?.verificationStatus !== "VERIFIED") reason = "NOT_VERIFIED";
      else if (!listingLive(r)) reason = "LISTING_UNAVAILABLE";
      else if (rate > r.maxCpcIrr) reason = "ABOVE_CEILING";
      else if (t.spentIrr + rate > r.dailyBudgetIrr) reason = "BUDGET_SPENT_TODAY";
      else {
        const b = await this.wallet.balancesOf(r.walletAccountId);
        if (b.PURCHASE_ONLY < rate && b.WITHDRAWABLE < rate) reason = "NO_FUNDS";
      }
      out.push({
        id: r.id,
        placement: r.placement,
        status: r.status,
        target: r.placement === SponsoredPlacement.SHOP ? { kind: "PRODUCT", id: r.productId!, title: r.product?.title ?? "—" } : { kind: "PROVIDER", id: r.providerOrganizationId!, title: r.providerOrganization?.name ?? "—" },
        dailyBudgetIrr: r.dailyBudgetIrr,
        maxCpcIrr: r.maxCpcIrr,
        staffHoldReason: r.staffHeldAt ? r.staffHoldReason : null,
        serving: reason === null,
        notServingReason: reason,
        today: t,
        total: total.get(r.id) ?? emptyStats(),
        createdAt: r.createdAt.toISOString(),
        stoppedAt: r.stoppedAt?.toISOString() ?? null,
        stoppedReason: r.stoppedReason,
      });
    }
    return out;
  }

  /** What this organisation can promote: a seller's live products, or a provider organisation itself. */
  async targets(account: WalletAccountWithOwner, q?: string): Promise<SponsoredTargetDto[]> {
    const live = await this.prisma.sponsoredCampaign.findMany({ where: { walletAccountId: account.id, status: { not: SponsoredCampaignStatus.STOPPED } }, select: { productId: true, providerOrganizationId: true, placement: true } });
    if (account.ownerType === WalletOwnerType.SELLER) {
      const search = q?.trim();
      const products = await this.prisma.product.findMany({
        where: {
          status: ProductStatus.ACTIVE,
          isDemoRecord: false,
          variants: { some: { offers: { some: { sellerOrganizationId: account.sellerOrganizationId!, status: SellerOfferStatus.ACTIVE, moderationStatus: SellerOfferModerationStatus.APPROVED } } } },
          ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}),
        },
        select: { id: true, title: true },
        orderBy: { title: "asc" },
        take: 50,
      });
      return products.map((p) => ({ placement: "SHOP", kind: "PRODUCT", id: p.id, title: p.title, live: live.some((l) => l.productId === p.id) }));
    }
    if (account.ownerType === WalletOwnerType.PROVIDER) {
      const org = await this.prisma.providerOrganization.findUniqueOrThrow({ where: { id: account.providerOrganizationId! }, select: { id: true, name: true, type: true } });
      const placement = VET_PROVIDER_TYPES.includes(org.type) ? SponsoredPlacement.VETS : SponsoredPlacement.SERVICES;
      return [{ placement, kind: "PROVIDER", id: org.id, title: org.name, live: live.some((l) => l.providerOrganizationId === org.id && l.placement === placement) }];
    }
    return [];
  }

  async create(userId: string, account: WalletAccountWithOwner, input: SponsoredCampaignInput): Promise<SponsoredCampaignDto> {
    if (!this.enabled()) throw new ValidationApiException({ field: "sponsored", reason: "SWITCHED_OFF" });
    if (!ownerIsVerified(account)) throw new ValidationApiException({ field: "organization", reason: "NOT_VERIFIED" });
    const rate = await this.rates.rateAt();
    this.validateLimits(input.dailyBudgetIrr, input.maxCpcIrr, rate);
    const placement = input.placement as SponsoredPlacement;
    const target = (await this.targets(account)).find((t) => t.placement === placement && (placement !== SponsoredPlacement.SHOP || t.id === input.productId));
    if (!target) throw new ValidationApiException({ field: placement === SponsoredPlacement.SHOP ? "productId" : "placement", reason: "NOT_PROMOTABLE" });
    if (target.live) throw new ValidationApiException({ field: "productId", reason: "ALREADY_RUNNING" });
    try {
      const row = await this.prisma.sponsoredCampaign.create({
        data: {
          walletAccountId: account.id,
          placement,
          ...(placement === SponsoredPlacement.SHOP ? { productId: target.id, sellerOrganizationId: account.sellerOrganizationId } : { providerOrganizationId: target.id }),
          dailyBudgetIrr: input.dailyBudgetIrr,
          maxCpcIrr: input.maxCpcIrr,
          createdByUserId: userId,
        },
        include: CAMPAIGN_INCLUDE,
      });
      this.slotCache.clear();
      return (await this.toCampaignDtos([row]))[0]!;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ValidationApiException({ field: "productId", reason: "ALREADY_RUNNING" });
      throw error;
    }
  }

  async update(account: WalletAccountWithOwner, id: string, input: { dailyBudgetIrr: number; maxCpcIrr: number }): Promise<SponsoredCampaignDto> {
    const row = await this.ownCampaign(account, id);
    if (row.status === SponsoredCampaignStatus.STOPPED) throw new ValidationApiException({ field: "campaign", reason: "STOPPED" });
    this.validateLimits(input.dailyBudgetIrr, input.maxCpcIrr, await this.rates.rateAt());
    const updated = await this.prisma.sponsoredCampaign.update({ where: { id }, data: { dailyBudgetIrr: input.dailyBudgetIrr, maxCpcIrr: input.maxCpcIrr }, include: CAMPAIGN_INCLUDE });
    this.slotCache.clear();
    return (await this.toCampaignDtos([updated]))[0]!;
  }

  /** Pause, resume or stop (final). A staff hold stays in force whatever the partner does. */
  async setStatus(account: WalletAccountWithOwner, id: string, action: "pause" | "resume" | "stop"): Promise<SponsoredCampaignDto> {
    const row = await this.ownCampaign(account, id);
    if (row.status === SponsoredCampaignStatus.STOPPED) throw new ValidationApiException({ field: "campaign", reason: "STOPPED" });
    if (action === "resume" && !this.enabled()) throw new ValidationApiException({ field: "sponsored", reason: "SWITCHED_OFF" });
    const data: Prisma.SponsoredCampaignUpdateInput =
      action === "pause" ? { status: SponsoredCampaignStatus.PAUSED }
      : action === "resume" ? { status: SponsoredCampaignStatus.ACTIVE }
      : { status: SponsoredCampaignStatus.STOPPED, stoppedAt: new Date(), stoppedReason: "PARTNER" };
    const updated = await this.prisma.sponsoredCampaign.update({ where: { id }, data, include: CAMPAIGN_INCLUDE });
    this.slotCache.clear();
    return (await this.toCampaignDtos([updated]))[0]!;
  }

  private async ownCampaign(account: WalletAccountWithOwner, id: string): Promise<CampaignRow> {
    const row = await this.prisma.sponsoredCampaign.findFirst({ where: { id, walletAccountId: account.id }, include: CAMPAIGN_INCLUDE });
    if (!row) throw new NotFoundApiException("Sponsored campaign");
    return row;
  }

  private validateLimits(dailyBudgetIrr: number, maxCpcIrr: number, rate: number): void {
    if (!Number.isInteger(dailyBudgetIrr) || dailyBudgetIrr < rate || dailyBudgetIrr > SPONSORED_MAX_DAILY_BUDGET_IRR) throw new ValidationApiException({ field: "dailyBudgetIrr", reason: "OUT_OF_RANGE", min: rate, max: SPONSORED_MAX_DAILY_BUDGET_IRR });
    if (!Number.isInteger(maxCpcIrr) || maxCpcIrr < rate || maxCpcIrr > SPONSORED_MAX_CPC_CEILING_IRR) throw new ValidationApiException({ field: "maxCpcIrr", reason: "OUT_OF_RANGE", min: rate, max: SPONSORED_MAX_CPC_CEILING_IRR });
  }

  clearCache(): void {
    this.slotCache.clear();
  }
}

/** A stable UUID-shaped id from a string, so a repeated notice is recognised as the same one. */
function stableUuid(key: string): string {
  const h = createHash("sha256").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
