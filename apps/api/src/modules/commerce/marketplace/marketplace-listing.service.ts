import { Injectable } from "@nestjs/common";
import { MarketplaceListingStatus, MarketplaceListingSyncStatus, MarketplaceSyncOperation, MarketplaceSyncAttemptStatus, Prisma, type MarketplaceListing } from "@prisma/client";
import type { MarketplaceListingDto, MarketplaceReconciliationResultDto, PaginatedDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { toPaginatedDto } from "../../../common/pagination/pagination.dto";
import { MarketplaceListingNotFoundException, OfferNotAvailableException } from "../../../common/errors/api-exception";
import type { ResolvedSellerContext } from "../../seller-os/auth/seller-context.types";
import { MarketplaceChannelAccountService } from "./marketplace-channel-account.service";
import { MarketplaceChannelRegistry } from "./marketplace-channel-registry.service";
import { toListingDto } from "./marketplace-dto.mapper";
import type { MarketplaceSimMode } from "./marketplace-channel-adapter.interface";

const LISTING_INCLUDE = {
  marketplaceChannelAccount: true,
  sellerOffer: { include: { inventoryItem: true, productVariant: { include: { product: true } } } },
} satisfies Prisma.MarketplaceListingInclude;

type ListingWithRelations = MarketplaceListing & Prisma.MarketplaceListingGetPayload<{ include: typeof LISTING_INCLUDE }>;

function availableQuantityOf(listing: ListingWithRelations): number {
  const item = listing.sellerOffer.inventoryItem;
  if (!item) return 0;
  return Math.max(0, item.onHand - item.reserved);
}

/**
 * Listing lifecycle + sync (spec section 15-16, 23, 32, 35) —
 * MarketplaceSyncOrchestrator's responsibilities from the spec (publish,
 * price/inventory sync, retries, sync-state updates, error normalization,
 * event emission) live here alongside listing CRUD rather than in a
 * separate file, since every one of those operations is really "do
 * something to one MarketplaceListing row and log the attempt" — splitting
 * them would only separate tightly coupled code. Every real provider call
 * goes through MarketplaceChannelRegistry, never a direct adapter reference.
 */
@Injectable()
export class MarketplaceListingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly registry: MarketplaceChannelRegistry,
    private readonly channelAccounts: MarketplaceChannelAccountService,
  ) {}

  async list(ctx: ResolvedSellerContext, query: { channelAccountId?: string; status?: MarketplaceListingStatus; syncStatus?: MarketplaceListingSyncStatus; page?: number; pageSize?: number }): Promise<PaginatedDto<MarketplaceListingDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.MarketplaceListingWhereInput = {
      marketplaceChannelAccount: { sellerOrganizationId: ctx.sellerOrganizationId },
      ...(query.channelAccountId ? { marketplaceChannelAccountId: query.channelAccountId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.syncStatus ? { syncStatus: query.syncStatus } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.marketplaceListing.findMany({ where, include: LISTING_INCLUDE, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.marketplaceListing.count({ where }),
    ]);

    const items = rows.map((r) => toListingDto(r, availableQuantityOf(r)));
    return toPaginatedDto(items, total, page, pageSize);
  }

  private async loadOwned(ctx: ResolvedSellerContext, listingId: string): Promise<ListingWithRelations> {
    const listing = await this.prisma.marketplaceListing.findUnique({ where: { id: listingId }, include: LISTING_INCLUDE });
    if (!listing || listing.marketplaceChannelAccount.sellerOrganizationId !== ctx.sellerOrganizationId) throw new MarketplaceListingNotFoundException({ listingId });
    return listing;
  }

  async getById(ctx: ResolvedSellerContext, listingId: string): Promise<MarketplaceListingDto> {
    const listing = await this.loadOwned(ctx, listingId);
    return toListingDto(listing, availableQuantityOf(listing));
  }

  async create(ctx: ResolvedSellerContext, input: { marketplaceChannelAccountId: string; sellerOfferId: string }): Promise<MarketplaceListingDto> {
    const account = await this.channelAccounts.getById(ctx, input.marketplaceChannelAccountId);
    const offer = await this.prisma.sellerOffer.findUnique({ where: { id: input.sellerOfferId } });
    if (!offer || offer.sellerOrganizationId !== ctx.sellerOrganizationId) throw new OfferNotAvailableException({ offerId: input.sellerOfferId });

    const listing = await this.prisma.marketplaceListing.create({
      data: {
        marketplaceChannelAccountId: account.id,
        sellerOfferId: offer.id,
        provider: account.provider,
        status: MarketplaceListingStatus.DRAFT,
        syncStatus: MarketplaceListingSyncStatus.NEVER_SYNCED,
      },
      include: LISTING_INCLUDE,
    });
    return toListingDto(listing, availableQuantityOf(listing));
  }

  /** Manual mapping edit (spec section 17-18) — lets a seller paste an already-existing external listing id rather than only ever publishing a brand-new one. */
  async updateMapping(ctx: ResolvedSellerContext, listingId: string, input: { externalListingId?: string; externalProductId?: string; externalVariantId?: string }): Promise<MarketplaceListingDto> {
    await this.loadOwned(ctx, listingId);
    const listing = await this.prisma.marketplaceListing.update({ where: { id: listingId }, data: input, include: LISTING_INCLUDE });
    return toListingDto(listing, availableQuantityOf(listing));
  }

  private async recordAttempt(
    tx: Prisma.TransactionClient,
    listing: ListingWithRelations,
    operation: MarketplaceSyncOperation,
    outcome: { success: boolean; errorCode?: string; errorMessage?: string; responseSummary?: Record<string, unknown> },
  ): Promise<void> {
    await tx.marketplaceSyncAttempt.create({
      data: {
        sellerOrganizationId: listing.marketplaceChannelAccount.sellerOrganizationId,
        marketplaceChannelAccountId: listing.marketplaceChannelAccountId,
        marketplaceListingId: listing.id,
        operation,
        status: outcome.success ? MarketplaceSyncAttemptStatus.SUCCESS : MarketplaceSyncAttemptStatus.FAILED,
        errorCode: outcome.errorCode,
        errorMessage: outcome.errorMessage,
        responseSummary: outcome.responseSummary as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
    await this.channelAccounts.recordSyncOutcome(tx, listing.marketplaceChannelAccountId, outcome);
  }

  /** `mode` is a dev/test-only lever (never exposed on the real seller-facing DTO — see MarketplaceDevController) that lets sandbox/DEV calls deterministically simulate a provider failure. */
  async publish(ctx: ResolvedSellerContext, listingId: string, mode?: MarketplaceSimMode): Promise<MarketplaceListingDto> {
    const listing = await this.loadOwned(ctx, listingId);
    this.registry.assertCapability(listing.provider, "supportsListingPublish");
    const adapter = this.registry.resolve(listing.provider);

    const result = await adapter.publishListing({
      sellerSku: listing.sellerOffer.sellerSku,
      title: `${listing.sellerOffer.productVariant.product.title}${listing.sellerOffer.productVariant.title ? ` — ${listing.sellerOffer.productVariant.title}` : ""}`,
      priceIrr: listing.sellerOffer.priceAmount,
      availableQuantity: availableQuantityOf(listing),
      mode,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.marketplaceListing.update({
        where: { id: listingId },
        data:
          result.status === "PUBLISHED"
            ? {
                externalListingId: result.externalListingId,
                status: MarketplaceListingStatus.ACTIVE,
                syncStatus: MarketplaceListingSyncStatus.SYNCED,
                publishedPriceIrr: listing.sellerOffer.priceAmount,
                publishedInventory: availableQuantityOf(listing),
                lastSyncedAt: new Date(),
                lastErrorCode: null,
                lastErrorMessage: null,
              }
            : { status: MarketplaceListingStatus.REJECTED, syncStatus: MarketplaceListingSyncStatus.FAILED, lastErrorCode: "PUBLISH_REJECTED", lastErrorMessage: result.failureMessage },
        include: LISTING_INCLUDE,
      });
      await this.recordAttempt(tx, listing, MarketplaceSyncOperation.LISTING_PUBLISH, { success: result.status === "PUBLISHED", errorCode: result.status === "REJECTED" ? "PUBLISH_REJECTED" : undefined, errorMessage: result.failureMessage });
      await this.events.publish(
        result.status === "PUBLISHED" ? "MarketplaceListingPublished" : "MarketplaceListingSyncFailed",
        { listingId, sellerOrganizationId: listing.marketplaceChannelAccount.sellerOrganizationId, provider: listing.provider },
        { tx, aggregateType: "MarketplaceListing", aggregateId: listingId },
      );
      return row;
    });

    return toListingDto(updated, availableQuantityOf(updated));
  }

  async syncPrice(ctx: ResolvedSellerContext, listingId: string, mode?: MarketplaceSimMode): Promise<MarketplaceListingDto> {
    const listing = await this.loadOwned(ctx, listingId);
    if (!listing.externalListingId) throw new MarketplaceListingNotFoundException({ listingId, reason: "NOT_PUBLISHED" });
    this.registry.assertCapability(listing.provider, "supportsPricePush");
    const adapter = this.registry.resolve(listing.provider);

    const result = await adapter.updatePrice({ externalListingId: listing.externalListingId, priceIrr: listing.sellerOffer.priceAmount, mode });

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.marketplaceListing.update({
        where: { id: listingId },
        data:
          result.status === "APPLIED"
            ? { publishedPriceIrr: listing.sellerOffer.priceAmount, syncStatus: MarketplaceListingSyncStatus.SYNCED, lastSyncedAt: new Date(), lastErrorCode: null, lastErrorMessage: null }
            : { syncStatus: MarketplaceListingSyncStatus.FAILED, lastErrorCode: "PRICE_SYNC_FAILED", lastErrorMessage: result.failureMessage },
        include: LISTING_INCLUDE,
      });
      await this.recordAttempt(tx, listing, MarketplaceSyncOperation.PRICE_SYNC, { success: result.status === "APPLIED", errorCode: result.status === "FAILED" ? "PRICE_SYNC_FAILED" : undefined, errorMessage: result.failureMessage });
      if (result.status === "FAILED") {
        await this.events.publish("MarketplaceListingSyncFailed", { listingId, sellerOrganizationId: listing.marketplaceChannelAccount.sellerOrganizationId, operation: "PRICE_SYNC" }, { tx, aggregateType: "MarketplaceListing", aggregateId: listingId });
      }
      return row;
    });

    return toListingDto(updated, availableQuantityOf(updated));
  }

  async syncInventory(ctx: ResolvedSellerContext, listingId: string, mode?: MarketplaceSimMode): Promise<MarketplaceListingDto> {
    const listing = await this.loadOwned(ctx, listingId);
    if (!listing.externalListingId) throw new MarketplaceListingNotFoundException({ listingId, reason: "NOT_PUBLISHED" });
    this.registry.assertCapability(listing.provider, "supportsInventoryPush");
    const adapter = this.registry.resolve(listing.provider);

    // The channel-safe sellable quantity, derived server-side (spec section 9) — never a raw onHand value.
    const availableQuantity = availableQuantityOf(listing);
    const result = await adapter.updateInventory({ externalListingId: listing.externalListingId, availableQuantity, mode });

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.marketplaceListing.update({
        where: { id: listingId },
        data:
          result.status === "APPLIED"
            ? { publishedInventory: availableQuantity, syncStatus: MarketplaceListingSyncStatus.SYNCED, lastSyncedAt: new Date(), lastErrorCode: null, lastErrorMessage: null }
            : { syncStatus: MarketplaceListingSyncStatus.FAILED, lastErrorCode: "INVENTORY_SYNC_FAILED", lastErrorMessage: result.failureMessage },
        include: LISTING_INCLUDE,
      });
      await this.recordAttempt(tx, listing, MarketplaceSyncOperation.INVENTORY_SYNC, { success: result.status === "APPLIED", errorCode: result.status === "FAILED" ? "INVENTORY_SYNC_FAILED" : undefined, errorMessage: result.failureMessage });
      if (result.status === "FAILED") {
        await this.events.publish("MarketplaceListingSyncFailed", { listingId, sellerOrganizationId: listing.marketplaceChannelAccount.sellerOrganizationId, operation: "INVENTORY_SYNC" }, { tx, aggregateType: "MarketplaceListing", aggregateId: listingId });
      }
      return row;
    });

    return toListingDto(updated, availableQuantityOf(updated));
  }

  /** The generic "sync everything" action the API exposes (spec section 52's `POST .../marketplace-listings/:listingId/sync`) — publishes first if never published, else refreshes price+inventory. */
  async syncAll(ctx: ResolvedSellerContext, listingId: string): Promise<MarketplaceListingDto> {
    const listing = await this.loadOwned(ctx, listingId);
    if (!listing.externalListingId) return this.publish(ctx, listingId);
    await this.syncPrice(ctx, listingId);
    return this.syncInventory(ctx, listingId);
  }

  async deactivate(ctx: ResolvedSellerContext, listingId: string): Promise<MarketplaceListingDto> {
    const listing = await this.loadOwned(ctx, listingId);
    if (listing.externalListingId) {
      this.registry.assertCapability(listing.provider, "supportsListingPause");
      const adapter = this.registry.resolve(listing.provider);
      await adapter.deactivateListing(listing.externalListingId);
    }
    const updated = await this.prisma.marketplaceListing.update({ where: { id: listingId }, data: { status: MarketplaceListingStatus.PAUSED }, include: LISTING_INCLUDE });
    return toListingDto(updated, availableQuantityOf(updated));
  }

  /**
   * Reconciliation for one listing (spec section 35-36) — canonical PET LIFE
   * OS inventory/price are never overwritten by what the provider reports;
   * a mismatch only produces a result + a RECONCILE MarketplaceSyncAttempt
   * row for audit, and flags the listing DEGRADED so the UI surfaces it.
   */
  async reconcile(ctx: ResolvedSellerContext, listingId: string): Promise<MarketplaceReconciliationResultDto> {
    const listing = await this.loadOwned(ctx, listingId);
    const checkedAt = new Date().toISOString();
    if (!listing.externalListingId) {
      return { discrepancyType: "UNKNOWN_PROVIDER_REFERENCE", canonicalValue: null, providerObservedValue: null, message: "This offer has not been published to this channel yet.", checkedAt };
    }
    this.registry.assertCapability(listing.provider, "supportsReconciliation");
    const adapter = this.registry.resolve(listing.provider);
    const observed = await adapter.reconcile({ externalListingId: listing.externalListingId });

    const canonicalAvailable = availableQuantityOf(listing);
    const canonicalPrice = listing.sellerOffer.priceAmount;

    let result: MarketplaceReconciliationResultDto;
    if (observed.observedInventory !== undefined && observed.observedInventory !== canonicalAvailable) {
      result = { discrepancyType: "INVENTORY_MISMATCH", canonicalValue: canonicalAvailable, providerObservedValue: observed.observedInventory, message: "Provider-reported stock differs from PET LIFE OS canonical inventory.", checkedAt };
    } else if (observed.observedPriceIrr !== undefined && observed.observedPriceIrr !== canonicalPrice) {
      result = { discrepancyType: "PRICE_MISMATCH", canonicalValue: canonicalPrice, providerObservedValue: observed.observedPriceIrr, message: "Provider-reported price differs from PET LIFE OS canonical price.", checkedAt };
    } else {
      result = { discrepancyType: null, canonicalValue: canonicalAvailable, providerObservedValue: observed.observedInventory ?? null, message: "No discrepancy detected.", checkedAt };
    }

    await this.prisma.$transaction(async (tx) => {
      await this.recordAttempt(tx, listing, MarketplaceSyncOperation.RECONCILE, {
        success: result.discrepancyType === null,
        errorCode: result.discrepancyType ?? undefined,
        errorMessage: result.discrepancyType ? result.message : undefined,
        responseSummary: { observedPriceIrr: observed.observedPriceIrr, observedInventory: observed.observedInventory },
      });
      if (result.discrepancyType) {
        await tx.marketplaceListing.update({ where: { id: listingId }, data: { syncStatus: MarketplaceListingSyncStatus.DEGRADED, lastProviderObservedAt: new Date() } });
        await this.events.publish(
          "MarketplaceInventoryMismatchDetected",
          { listingId, sellerOrganizationId: listing.marketplaceChannelAccount.sellerOrganizationId, discrepancyType: result.discrepancyType },
          { tx, aggregateType: "MarketplaceListing", aggregateId: listingId },
        );
      }
    });

    return result;
  }
}
