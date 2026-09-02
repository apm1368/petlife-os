import { Injectable } from "@nestjs/common";
import { FulfillmentStatus, OrderStatus, Prisma, type Order } from "@prisma/client";
import type { OrderDetailDto, PaginatedDto, SellerOrderSummaryDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { toPaginatedDto } from "../../common/pagination/pagination.dto";
import { OrderNotFoundException } from "../../common/errors/api-exception";
import { toFulfillmentDto } from "../commerce/logistics/logistics-dto.mapper";
import { toSellerSummaryDto } from "../commerce/commerce-dto.mapper";
import type { ResolvedSellerContext } from "./auth/seller-context.types";

const ORDER_WITH_MARKETPLACE_INCLUDE = {
  marketplaceOrder: true,
  items: true,
  sellerOrganization: true,
} satisfies Prisma.OrderInclude;

type OrderWithMarketplace = Prisma.OrderGetPayload<{ include: typeof ORDER_WITH_MARKETPLACE_INCLUDE }>;

function toSummary(order: OrderWithMarketplace, fulfillmentStatus: FulfillmentStatus | null): SellerOrderSummaryDto {
  return {
    orderId: order.id,
    source: order.marketplaceOrder ? (order.marketplaceOrder.provider as unknown as SellerOrderSummaryDto["source"]) : null,
    externalOrderId: order.marketplaceOrder?.externalOrderId ?? null,
    status: order.status as unknown as SellerOrderSummaryDto["status"],
    paymentSource: order.marketplaceOrder ? (order.marketplaceOrder.paymentSource as unknown as SellerOrderSummaryDto["paymentSource"]) : ("PETLIFE_PAYMENT" as SellerOrderSummaryDto["paymentSource"]),
    fulfillmentStatus: fulfillmentStatus as unknown as SellerOrderSummaryDto["fulfillmentStatus"],
    itemCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
    totalAmount: order.totalAmount,
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
  };
}

/**
 * Seller-facing unified Orders view (spec section 37-38) — spans both
 * ordinary PET LIFE OS checkout Orders and marketplace-origin Orders,
 * distinguished by `source`/`paymentSource`, never collapsed into one
 * ambiguous row. Every marketplace-origin Order that was successfully
 * ingested always has a `mappedOrder` (MarketplaceOrderIngestionService
 * creates both in the same transaction, or neither) — so `orderId` here
 * always means the canonical internal Order id, and a marketplace order's
 * detail is reached the same way a checkout order's is.
 *
 * Combining the two sources into one paginated, sorted list is done by
 * fetching a bounded page from each table and merging in application code
 * rather than a single SQL UNION — acceptable at this project's scale
 * (spec section 69's N+1/pagination requirement is about not returning an
 * unbounded response, which this still satisfies); a seller with very high
 * order volume would need a real UNION-backed query, noted in README Known
 * limitations.
 */
@Injectable()
export class SellerOrderService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: ResolvedSellerContext, query: { status?: OrderStatus; page?: number; pageSize?: number }): Promise<PaginatedDto<SellerOrderSummaryDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.OrderWhereInput = { sellerOrganizationId: ctx.sellerOrganizationId, ...(query.status ? { status: query.status } : {}) };

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({ where, include: ORDER_WITH_MARKETPLACE_INCLUDE, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.order.count({ where }),
    ]);

    const orderIds = rows.map((o) => o.id);
    const fulfillments = await this.prisma.fulfillment.findMany({ where: { orderId: { in: orderIds }, sequenceNumber: 1 } });
    const fulfillmentByOrderId = new Map(fulfillments.map((f) => [f.orderId, f.status]));

    const items = rows.map((order) => toSummary(order, fulfillmentByOrderId.get(order.id) ?? null));
    return toPaginatedDto(items, total, page, pageSize);
  }

  private async loadOwned(ctx: ResolvedSellerContext, orderId: string): Promise<Order & { marketplaceOrder: OrderWithMarketplace["marketplaceOrder"] }> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { marketplaceOrder: true } });
    if (!order || order.sellerOrganizationId !== ctx.sellerOrganizationId) throw new OrderNotFoundException({ orderId });
    return order;
  }

  async getById(ctx: ResolvedSellerContext, orderId: string): Promise<OrderDetailDto & { source: SellerOrderSummaryDto["source"]; externalOrderId: string | null; paymentSource: SellerOrderSummaryDto["paymentSource"] }> {
    const order = await this.loadOwned(ctx, orderId);
    const [items, fulfillment, sellerOrganization] = await Promise.all([
      this.prisma.orderItem.findMany({ where: { orderId } }),
      this.prisma.fulfillment.findUnique({ where: { orderId_sequenceNumber: { orderId, sequenceNumber: 1 } } }),
      this.prisma.sellerOrganization.findUniqueOrThrow({ where: { id: order.sellerOrganizationId } }),
    ]);

    return {
      id: order.id,
      checkoutId: order.checkoutId,
      sellerOrganization: toSellerSummaryDto(sellerOrganization),
      status: order.status as unknown as OrderDetailDto["status"],
      paymentStatus: null,
      financingStatus: null,
      refunds: [],
      fulfillment: fulfillment ? toFulfillmentDto(fulfillment) : null,
      subtotalAmount: order.subtotalAmount,
      deliveryAmount: order.deliveryAmount,
      discountAmount: order.discountAmount,
      totalAmount: order.totalAmount,
      currency: order.currency,
      shippingAddress: null,
      items: items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productVariantId: item.productVariantId,
        productTitleSnapshot: item.productTitleSnapshot,
        variantTitleSnapshot: item.variantTitleSnapshot,
        skuSnapshot: item.skuSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        targetPetId: item.targetPetId,
        compatibilitySnapshot: null,
      })),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      confirmedAt: order.confirmedAt?.toISOString() ?? null,
      source: order.marketplaceOrder ? (order.marketplaceOrder.provider as unknown as SellerOrderSummaryDto["source"]) : null,
      externalOrderId: order.marketplaceOrder?.externalOrderId ?? null,
      paymentSource: order.marketplaceOrder ? (order.marketplaceOrder.paymentSource as unknown as SellerOrderSummaryDto["paymentSource"]) : ("PETLIFE_PAYMENT" as SellerOrderSummaryDto["paymentSource"]),
    };
  }
}
