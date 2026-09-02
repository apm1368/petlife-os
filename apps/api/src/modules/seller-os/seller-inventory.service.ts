import { Injectable } from "@nestjs/common";
import { InventoryMovementType } from "@prisma/client";
import type { InventoryMovementDto, PaginatedDto, SellerOsOfferDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { InventoryMovementInvalidException } from "../../common/errors/api-exception";
import { toPaginatedDto } from "../../common/pagination/pagination.dto";
import { InventoryMovementService } from "../commerce/inventory/inventory-movement.service";
import { SellerAccessService } from "./seller-access.service";
import { SellerOfferService } from "./seller-offer.service";
import type { ResolvedSellerContext } from "./auth/seller-context.types";
import { InventoryAdjustmentMode, type AdjustInventoryDto, type ListInventoryMovementsQueryDto, type ListSellerInventoryQueryDto } from "./dto/seller-inventory.dto";

/**
 * Seller-facing inventory read/adjust surface (spec section 7-8, 41) — the
 * Offer+Inventory combined view (search/filter/low-stock/sync-status) is the
 * same data SellerOfferService.list already assembles, so this delegates to
 * it rather than duplicating the query; the only genuinely inventory-specific
 * behavior here is the concurrency-safe adjust/history pair, which goes
 * through InventoryMovementService (the one place onHand is ever mutated
 * outside the checkout reservation flow).
 */
@Injectable()
export class SellerInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryMovements: InventoryMovementService,
    private readonly sellerAccess: SellerAccessService,
    private readonly sellerOffers: SellerOfferService,
  ) {}

  async list(ctx: ResolvedSellerContext, query: ListSellerInventoryQueryDto): Promise<PaginatedDto<SellerOsOfferDto>> {
    return this.sellerOffers.list(ctx, query);
  }

  private async loadOwnedInventoryItem(ctx: ResolvedSellerContext, inventoryItemId: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: inventoryItemId }, include: { sellerOffer: true } });
    if (!item || item.sellerOffer.sellerOrganizationId !== ctx.sellerOrganizationId) {
      throw new InventoryMovementInvalidException({ inventoryItemId, reason: "NOT_FOUND_OR_NOT_OWNED" });
    }
    return item;
  }

  async adjust(ctx: ResolvedSellerContext, inventoryItemId: string, dto: AdjustInventoryDto): Promise<SellerOsOfferDto> {
    this.sellerAccess.assertOperational(ctx.sellerStatus);
    const item = await this.loadOwnedInventoryItem(ctx, inventoryItemId);

    const delta = dto.mode === InventoryAdjustmentMode.ABSOLUTE ? dto.quantity - item.onHand : dto.quantity;

    await this.prisma.$transaction(async (tx) => {
      await this.inventoryMovements.applyOnHandDelta(tx, {
        inventoryItemId,
        sellerOrganizationId: ctx.sellerOrganizationId,
        delta,
        type: InventoryMovementType.MANUAL_ADJUSTMENT,
        source: "SELLER_OS",
        reason: dto.reason,
        actorUserId: ctx.userId,
      });
    });

    return this.sellerOffers.getById(ctx, item.sellerOfferId);
  }

  async history(ctx: ResolvedSellerContext, inventoryItemId: string, query: ListInventoryMovementsQueryDto): Promise<PaginatedDto<InventoryMovementDto>> {
    await this.loadOwnedInventoryItem(ctx, inventoryItemId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [rows, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where: { inventoryItemId },
        include: { actorUser: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inventoryMovement.count({ where: { inventoryItemId } }),
    ]);

    const items: InventoryMovementDto[] = rows.map((m) => ({
      id: m.id,
      inventoryItemId: m.inventoryItemId,
      type: m.type as unknown as InventoryMovementDto["type"],
      quantityDelta: m.quantityDelta,
      quantityBefore: m.quantityBefore,
      quantityAfter: m.quantityAfter,
      source: m.source,
      sourceReference: m.sourceReference,
      reason: m.reason,
      actorUserId: m.actorUserId,
      actorDisplayName: m.actorUser?.displayName ?? null,
      createdAt: m.createdAt.toISOString(),
    }));

    return toPaginatedDto(items, total, page, pageSize);
  }
}
