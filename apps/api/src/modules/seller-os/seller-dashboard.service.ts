import { Injectable } from "@nestjs/common";
import { FulfillmentStatus, MarketplaceListingSyncStatus, SellerOfferStatus } from "@prisma/client";
import type { SellerDashboardDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { LOW_STOCK_THRESHOLD } from "./seller-offer.service";
import { SellerOrderService } from "./seller-order.service";
import type { ResolvedSellerContext } from "./auth/seller-context.types";

/** Lightweight dashboard metrics computed from existing data (spec section 40, 71) — no data warehouse, no separate analytics store. */
@Injectable()
export class SellerDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: SellerOrderService,
  ) {}

  async getDashboard(ctx: ResolvedSellerContext): Promise<SellerDashboardDto> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [ordersRequiringActionCount, activeOfferCount, allOffers, channelSyncErrorCount, fulfillmentExceptionCount, todaysOrders, recent] = await Promise.all([
      this.prisma.fulfillment.count({ where: { sellerOrgId: ctx.sellerOrganizationId, status: FulfillmentStatus.AWAITING_SELLER_PREPARATION } }),
      this.prisma.sellerOffer.count({ where: { sellerOrganizationId: ctx.sellerOrganizationId, status: SellerOfferStatus.ACTIVE } }),
      this.prisma.sellerOffer.findMany({ where: { sellerOrganizationId: ctx.sellerOrganizationId }, include: { inventoryItem: true } }),
      this.prisma.marketplaceListing.count({
        where: { marketplaceChannelAccount: { sellerOrganizationId: ctx.sellerOrganizationId }, syncStatus: { in: [MarketplaceListingSyncStatus.FAILED, MarketplaceListingSyncStatus.DEGRADED] } },
      }),
      this.prisma.fulfillment.count({ where: { sellerOrgId: ctx.sellerOrganizationId, status: FulfillmentStatus.FAILED } }),
      this.prisma.order.findMany({ where: { sellerOrganizationId: ctx.sellerOrganizationId, createdAt: { gte: startOfToday } }, include: { items: true } }),
      this.orders.list(ctx, { page: 1, pageSize: 5 }),
    ]);

    const lowStockOfferCount = allOffers.filter((o) => o.inventoryItem && Math.max(0, o.inventoryItem.onHand - o.inventoryItem.reserved) <= LOW_STOCK_THRESHOLD).length;
    const unitsSoldToday = todaysOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);
    const gmvTodayAmount = todaysOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    return {
      ordersRequiringActionCount,
      lowStockOfferCount,
      activeOfferCount,
      channelSyncErrorCount,
      fulfillmentExceptionCount,
      ordersToday: todaysOrders.length,
      unitsSoldToday,
      gmvTodayAmount,
      recentOrders: recent.items,
    };
  }
}
