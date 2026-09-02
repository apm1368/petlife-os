import { Injectable } from "@nestjs/common";
import {
  DeliveryResponsibility,
  InventoryMovementType,
  MarketplaceOrderStatus,
  OrderStatus,
  PaymentSourceType,
  Prisma,
  type MarketplaceChannelAccount,
  type MarketplaceOrder,
} from "@prisma/client";
import type { MarketplaceOrderDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { MarketplaceOrderIngestionFailedException, MarketplaceOrderNotFoundException, MarketplaceWebhookInvalidException } from "../../../common/errors/api-exception";
import { InventoryMovementService } from "../inventory/inventory-movement.service";
import { normalizeMarketplaceOrderStatus } from "./marketplace-order-status-normalizer";
import { toMarketplaceOrderDto } from "./marketplace-dto.mapper";
import type { FetchedMarketplaceOrder, MarketplaceWebhookResult } from "./marketplace-channel-adapter.interface";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Normalizes an already-verified provider payload into a canonical internal
 * command and ingests it (spec section 24-27) — the entry point is always
 * `processWebhookResult`, called only after the owning adapter's
 * `verifyWebhook` has confirmed the payload (never before — `valid: false`
 * must never mutate any state, same discipline as the Handoff 08 shipping
 * webhook pipeline).
 *
 * Idempotency (spec section 26): `@@unique([provider, marketplaceChannelAccountId,
 * externalOrderId])` on MarketplaceOrder is the guard — a duplicate delivery
 * hits that constraint (P2002-catch, the same pattern OrdersService uses for
 * "1 Checkout -> N Orders") and returns the already-ingested row unchanged,
 * never re-decrementing inventory or creating a second internal Order.
 *
 * Oversell protection (spec section 10, 21): item resolution, the internal
 * Order/OrderItem creation, and every inventory decrement all happen inside
 * the SAME transaction as the MarketplaceOrder insert. InventoryMovementService
 * locks each InventoryItem row before decrementing, so two concurrent orders
 * racing for the last unit serialize at the database level; if the loser's
 * decrement would take available stock negative, its whole transaction rolls
 * back — including its MarketplaceOrder insert — so no order is ever recorded
 * as ingested against stock it didn't actually get. A provider is expected to
 * retry a failed ingestion; this phase does not persist a FAILED
 * MarketplaceOrder row for an oversell rejection (documented known limitation).
 *
 * Fulfillment/Shipment are deliberately NOT auto-created for a marketplace
 * order this phase (spec section 27, 73: "do not assume PET LIFE OS always
 * owns last-mile delivery" / "do not create a courier request automatically
 * unless PET LIFE OS is responsible for delivery") — the internal Order
 * exists for seller-visibility/reporting; a future handoff decides how
 * MARKETPLACE/SELLER-responsibility Fulfillment rows are created without an
 * automatic courier request.
 */
@Injectable()
export class MarketplaceOrderIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly inventoryMovements: InventoryMovementService,
  ) {}

  async processWebhookResult(account: MarketplaceChannelAccount, result: MarketplaceWebhookResult): Promise<MarketplaceOrderDto> {
    if (!result.valid) throw new MarketplaceWebhookInvalidException({ provider: account.provider });

    if (result.kind === "ORDER_CANCELLATION") {
      if (!result.externalOrderId) throw new MarketplaceWebhookInvalidException({ provider: account.provider, reason: "MISSING_EXTERNAL_ORDER_ID" });
      return this.cancelOrder(account, result.externalOrderId);
    }
    if (result.kind === "ORDER" && result.order) {
      return this.ingestOrder(account, result.order);
    }
    throw new MarketplaceWebhookInvalidException({ provider: account.provider, reason: "UNRECOGNIZED_PAYLOAD" });
  }

  private async loadOrderWithItems(id: string) {
    return this.prisma.marketplaceOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
  }

  async ingestOrder(account: MarketplaceChannelAccount, fetched: FetchedMarketplaceOrder): Promise<MarketplaceOrderDto> {
    const status = normalizeMarketplaceOrderStatus(account.provider, fetched.rawStatus);

    const orderId = await this.prisma.$transaction(async (tx) => {
      let marketplaceOrder: MarketplaceOrder;
      let isNew = false;
      try {
        marketplaceOrder = await tx.marketplaceOrder.create({
          data: {
            provider: account.provider,
            marketplaceChannelAccountId: account.id,
            sellerOrganizationId: account.sellerOrganizationId,
            externalOrderId: fetched.externalOrderId,
            status,
            currency: fetched.currency,
            totalAmount: fetched.totalAmount,
            deliveryResponsibility: DeliveryResponsibility.MARKETPLACE,
            paymentSource: PaymentSourceType.MARKETPLACE_COLLECTED,
            buyerSnapshot: (fetched.buyerSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            shippingSnapshot: (fetched.shippingSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            placedAt: fetched.placedAt,
            providerUpdatedAt: fetched.providerUpdatedAt,
          },
        });
        isNew = true;
      } catch (error) {
        if (!isUniqueConstraintViolation(error)) throw error;
        marketplaceOrder = await tx.marketplaceOrder.findUniqueOrThrow({
          where: { provider_marketplaceChannelAccountId_externalOrderId: { provider: account.provider, marketplaceChannelAccountId: account.id, externalOrderId: fetched.externalOrderId } },
        });
      }

      if (!isNew) return marketplaceOrder.id; // idempotent replay — no items, no inventory change, no second internal Order

      const resolvedItems: { sellerOfferId: string; marketplaceListingId: string | null; quantity: number; unitPriceAmount: number; totalPriceAmount: number }[] = [];
      for (const item of fetched.items) {
        const listing = item.externalListingId
          ? await tx.marketplaceListing.findFirst({ where: { marketplaceChannelAccountId: account.id, externalListingId: item.externalListingId } })
          : null;
        const offerBySku = !listing && item.sellerSku ? await tx.sellerOffer.findFirst({ where: { sellerOrganizationId: account.sellerOrganizationId, sellerSku: item.sellerSku } }) : null;
        const sellerOfferId = listing?.sellerOfferId ?? offerBySku?.id;
        if (!sellerOfferId) {
          throw new MarketplaceOrderIngestionFailedException({ externalOrderId: fetched.externalOrderId, reason: "UNMAPPED_ITEM", externalListingId: item.externalListingId, sellerSku: item.sellerSku });
        }
        resolvedItems.push({ sellerOfferId, marketplaceListingId: listing?.id ?? null, quantity: item.quantity, unitPriceAmount: item.unitPriceAmount, totalPriceAmount: item.totalPriceAmount });
      }

      const orderItemsData: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [];
      for (const item of resolvedItems) {
        await tx.marketplaceOrderItem.create({
          data: { marketplaceOrderId: marketplaceOrder.id, marketplaceListingId: item.marketplaceListingId, sellerOfferId: item.sellerOfferId, quantity: item.quantity, unitPriceAmount: item.unitPriceAmount, totalPriceAmount: item.totalPriceAmount },
        });

        const offer = await tx.sellerOffer.findUniqueOrThrow({ where: { id: item.sellerOfferId }, include: { inventoryItem: true, productVariant: true } });
        if (offer.inventoryItem) {
          await this.inventoryMovements.applyOnHandDelta(tx, {
            inventoryItemId: offer.inventoryItem.id,
            sellerOrganizationId: account.sellerOrganizationId,
            delta: -item.quantity,
            type: InventoryMovementType.MARKETPLACE_ORDER,
            source: `MARKETPLACE_${account.provider}`,
            sourceReference: marketplaceOrder.id,
            reason: "Marketplace order received",
          });
        }

        orderItemsData.push({
          productId: offer.productVariant.productId,
          productVariantId: offer.productVariantId,
          sellerOfferId: offer.id,
          productTitleSnapshot: offer.productVariant.title ?? offer.productVariant.sku,
          variantTitleSnapshot: offer.productVariant.title,
          skuSnapshot: offer.productVariant.sku,
          quantity: item.quantity,
          unitPrice: item.unitPriceAmount,
          totalPrice: item.totalPriceAmount,
          compatibilitySnapshot: Prisma.JsonNull,
        });
      }

      const internalOrder = await tx.order.create({
        data: {
          sellerOrganizationId: account.sellerOrganizationId,
          checkoutId: null,
          userId: null,
          householdId: null,
          status: OrderStatus.CONFIRMED,
          subtotalAmount: fetched.totalAmount,
          deliveryAmount: 0,
          discountAmount: 0,
          totalAmount: fetched.totalAmount,
          currency: fetched.currency,
          shippingAddressId: null,
          shippingAddressSnapshot: (fetched.shippingSnapshot ?? {}) as Prisma.InputJsonValue,
          confirmedAt: new Date(),
          items: { create: orderItemsData },
        },
      });
      await tx.marketplaceOrder.update({ where: { id: marketplaceOrder.id }, data: { mappedOrderId: internalOrder.id } });

      await this.events.publish(
        "MarketplaceOrderReceived",
        { marketplaceOrderId: marketplaceOrder.id, sellerOrganizationId: account.sellerOrganizationId, provider: account.provider, mappedOrderId: internalOrder.id },
        { tx, aggregateType: "MarketplaceOrder", aggregateId: marketplaceOrder.id },
      );

      return marketplaceOrder.id;
    });

    return toMarketplaceOrderDto(await this.loadOrderWithItems(orderId));
  }

  async cancelOrder(account: MarketplaceChannelAccount, externalOrderId: string): Promise<MarketplaceOrderDto> {
    const orderId = await this.prisma.$transaction(async (tx) => {
      const order = await tx.marketplaceOrder.findUnique({
        where: { provider_marketplaceChannelAccountId_externalOrderId: { provider: account.provider, marketplaceChannelAccountId: account.id, externalOrderId } },
        include: { items: true },
      });
      if (!order) throw new MarketplaceOrderNotFoundException({ externalOrderId, provider: account.provider });

      // Duplicate cancellation is a safe no-op (spec section 31) — inventory is restored exactly once.
      if (order.status === MarketplaceOrderStatus.CANCELLED) return order.id;

      for (const item of order.items) {
        const offer = await tx.sellerOffer.findUnique({ where: { id: item.sellerOfferId }, include: { inventoryItem: true } });
        if (offer?.inventoryItem) {
          await this.inventoryMovements.applyOnHandDelta(tx, {
            inventoryItemId: offer.inventoryItem.id,
            sellerOrganizationId: account.sellerOrganizationId,
            delta: item.quantity,
            type: InventoryMovementType.MARKETPLACE_CANCELLATION,
            source: `MARKETPLACE_${account.provider}`,
            sourceReference: order.id,
            reason: "Marketplace order cancelled",
          });
        }
      }

      await tx.marketplaceOrder.update({ where: { id: order.id }, data: { status: MarketplaceOrderStatus.CANCELLED } });
      if (order.mappedOrderId) {
        await tx.order.update({ where: { id: order.mappedOrderId }, data: { status: OrderStatus.CANCELLED } });
      }
      await this.events.publish("MarketplaceOrderCancelled", { marketplaceOrderId: order.id, sellerOrganizationId: account.sellerOrganizationId, provider: account.provider }, { tx, aggregateType: "MarketplaceOrder", aggregateId: order.id });

      return order.id;
    });

    return toMarketplaceOrderDto(await this.loadOrderWithItems(orderId));
  }
}
