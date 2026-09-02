import { Injectable } from "@nestjs/common";
import { MarketplaceListingSyncStatus, Prisma, SellerOfferStatus, type InventoryItem, type Product, type ProductVariant, type SellerOffer } from "@prisma/client";
import type { PaginatedDto, SellerOsOfferDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { toPaginatedDto } from "../../common/pagination/pagination.dto";
import { OfferNotAvailableException } from "../../common/errors/api-exception";
import { SellerAccessService } from "./seller-access.service";
import type { ResolvedSellerContext } from "./auth/seller-context.types";
import type { CreateSellerOfferDto, ListSellerOffersQueryDto, UpdateSellerOfferDto } from "./dto/seller-offer.dto";

/** Below this available quantity, an offer is flagged "low stock" in the Seller OS UI (spec section 40-41) — a fixed, documented threshold, not per-seller configurable this phase. */
export const LOW_STOCK_THRESHOLD = 5;

type OfferWithRelations = SellerOffer & {
  productVariant: ProductVariant & { product: Product };
  inventoryItem: InventoryItem | null;
  _count: { marketplaceListings: number };
  marketplaceListings: { syncStatus: MarketplaceListingSyncStatus }[];
};

function toDto(offer: OfferWithRelations): SellerOsOfferDto {
  const onHand = offer.inventoryItem?.onHand ?? 0;
  const reserved = offer.inventoryItem?.reserved ?? 0;
  const syncErrorCount = offer.marketplaceListings.filter((l) => l.syncStatus === MarketplaceListingSyncStatus.FAILED || l.syncStatus === MarketplaceListingSyncStatus.DEGRADED).length;

  return {
    id: offer.id,
    productVariantId: offer.productVariantId,
    productTitle: offer.productVariant.product.title,
    variantTitle: offer.productVariant.title,
    sku: offer.productVariant.sku,
    sellerSku: offer.sellerSku,
    priceAmount: offer.priceAmount,
    compareAtAmount: offer.compareAtAmount,
    currency: offer.currency,
    status: offer.status as unknown as SellerOsOfferDto["status"],
    inventory: offer.inventoryItem
      ? {
          id: offer.inventoryItem.id,
          sellerOfferId: offer.id,
          onHand,
          reserved,
          available: Math.max(0, onHand - reserved),
          updatedAt: offer.inventoryItem.updatedAt.toISOString(),
        }
      : null,
    marketplaceListingCount: offer._count.marketplaceListings,
    marketplaceSyncErrorCount: syncErrorCount,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  };
}

const OFFER_INCLUDE = {
  productVariant: { include: { product: true } },
  inventoryItem: true,
  _count: { select: { marketplaceListings: true } },
  marketplaceListings: { select: { syncStatus: true } },
} satisfies Prisma.SellerOfferInclude;

/**
 * Seller Offer management (spec section 6) — the canonical SellerOffer/
 * ProductVariant/Product hierarchy from Handoff 06 is preserved exactly;
 * this only adds a seller-authorized, seller-facing read/write surface over
 * it. Global catalog editing (Product/ProductVariant fields) stays out of
 * scope (spec: "Global catalog editing can remain future work").
 */
@Injectable()
export class SellerOfferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly sellerAccess: SellerAccessService,
  ) {}

  async list(ctx: ResolvedSellerContext, query: ListSellerOffersQueryDto): Promise<PaginatedDto<SellerOsOfferDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.SellerOfferWhereInput = {
      sellerOrganizationId: ctx.sellerOrganizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { sellerSku: { contains: query.search, mode: "insensitive" } },
              { productVariant: { sku: { contains: query.search, mode: "insensitive" } } },
              { productVariant: { product: { title: { contains: query.search, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.sellerOffer.findMany({ where, include: OFFER_INCLUDE, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.sellerOffer.count({ where }),
    ]);

    let items = rows.map(toDto);
    if (query.lowStock) items = items.filter((o) => o.inventory && o.inventory.available <= LOW_STOCK_THRESHOLD);

    return toPaginatedDto(items, total, page, pageSize);
  }

  private async loadOwned(ctx: ResolvedSellerContext, offerId: string): Promise<OfferWithRelations> {
    const offer = await this.prisma.sellerOffer.findUnique({ where: { id: offerId }, include: OFFER_INCLUDE });
    if (!offer || offer.sellerOrganizationId !== ctx.sellerOrganizationId) throw new OfferNotAvailableException({ offerId });
    return offer;
  }

  async getById(ctx: ResolvedSellerContext, offerId: string): Promise<SellerOsOfferDto> {
    return toDto(await this.loadOwned(ctx, offerId));
  }

  async create(ctx: ResolvedSellerContext, dto: CreateSellerOfferDto): Promise<SellerOsOfferDto> {
    this.sellerAccess.assertOperational(ctx.sellerStatus);

    const created = await this.prisma.$transaction(async (tx) => {
      const offer = await tx.sellerOffer.create({
        data: {
          sellerOrganizationId: ctx.sellerOrganizationId,
          productVariantId: dto.productVariantId,
          priceAmount: dto.priceAmount,
          compareAtAmount: dto.compareAtAmount,
          sellerSku: dto.sellerSku,
          status: SellerOfferStatus.ACTIVE,
          inventoryItem: { create: { onHand: dto.initialOnHand ?? 0, reserved: 0 } },
        },
        include: OFFER_INCLUDE,
      });
      await this.events.publish("SellerOfferActivated", { sellerOfferId: offer.id, sellerOrganizationId: ctx.sellerOrganizationId }, { tx, aggregateType: "SellerOffer", aggregateId: offer.id });
      return offer;
    });

    return toDto(created);
  }

  async update(ctx: ResolvedSellerContext, offerId: string, dto: UpdateSellerOfferDto): Promise<SellerOsOfferDto> {
    this.sellerAccess.assertOperational(ctx.sellerStatus);
    const existing = await this.loadOwned(ctx, offerId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const offer = await tx.sellerOffer.update({
        where: { id: offerId },
        data: {
          ...(dto.priceAmount !== undefined ? { priceAmount: dto.priceAmount } : {}),
          ...(dto.compareAtAmount !== undefined ? { compareAtAmount: dto.compareAtAmount } : {}),
          ...(dto.sellerSku !== undefined ? { sellerSku: dto.sellerSku } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
        include: OFFER_INCLUDE,
      });

      if (dto.priceAmount !== undefined && dto.priceAmount !== existing.priceAmount) {
        await this.events.publish(
          "SellerOfferPriceChanged",
          { sellerOfferId: offerId, sellerOrganizationId: ctx.sellerOrganizationId, fromPriceAmount: existing.priceAmount, toPriceAmount: dto.priceAmount },
          { tx, aggregateType: "SellerOffer", aggregateId: offerId },
        );
      }
      if (dto.status !== undefined && dto.status !== existing.status) {
        const eventType = dto.status === SellerOfferStatus.ACTIVE ? "SellerOfferActivated" : "SellerOfferDeactivated";
        await this.events.publish(eventType, { sellerOfferId: offerId, sellerOrganizationId: ctx.sellerOrganizationId, status: dto.status }, { tx, aggregateType: "SellerOffer", aggregateId: offerId });
      }

      return offer;
    });

    return toDto(updated);
  }
}
