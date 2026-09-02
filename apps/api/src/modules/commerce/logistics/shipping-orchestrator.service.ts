import { Injectable } from "@nestjs/common";
import { FulfillmentStatus, Prisma, ShipmentStatus, ShippingProvider, ShippingQuoteStatus, type Fulfillment, type Shipment, type ShippingQuote } from "@prisma/client";
import type { AddressSnapshotDto, SellerShippingOptionsDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService, type DomainEventType } from "../../../common/events/domain-events.service";
import {
  CheckoutNotFoundException,
  FulfillmentNotFoundException,
  OrderNotFoundException,
  ShipmentCreationFailedException,
  ShippingQuoteExpiredException,
  ShippingQuoteNotEligibleException,
  ShippingQuoteNotFoundException,
} from "../../../common/errors/api-exception";
import { toSellerSummaryDto } from "../commerce-dto.mapper";
import { FulfillmentTransitionService } from "./fulfillment-transition.service";
import { ShippingProviderRegistry } from "./shipping-provider-registry.service";
import { toAddressSnapshotDto, toShippingQuoteDto } from "./logistics-dto.mapper";
import { buildShippingPackage } from "./shipping-package.util";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

interface SellerContext {
  sellerOrgId: string;
  sellerOrganization: { id: string; name: string; verificationStatus: string; status: string; city: string | null };
  pickupAddress: AddressSnapshotDto;
  shippingPackageLines: { quantity: number; unitPriceAmount: number; variantWeightValue: number | null; variantWeightUnit: string | null }[];
}

/**
 * Orchestrates the Checkout-time shipping-quote lifecycle and, once an
 * Order exists, its Fulfillment/Shipment creation and seller-ops actions
 * (spec section 12). Deliberately does not import CheckoutModule/
 * OrdersModule — like RefundsService (Handoff 07), it reads/writes
 * Checkout/Order rows directly via PrismaService to avoid a module import
 * cycle (CheckoutModule imports LogisticsModule, not the other way around).
 */
@Injectable()
export class ShippingOrchestrator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shippingProviders: ShippingProviderRegistry,
    private readonly transitions: FulfillmentTransitionService,
    private readonly events: DomainEventsService,
  ) {}

  // ---------------------------------------------------------------------
  // Checkout-time shipping quotes
  // ---------------------------------------------------------------------

  private async loadOwnedCheckout(userId: string, checkoutId: string) {
    const checkout = await this.prisma.checkout.findUnique({ where: { id: checkoutId } });
    if (!checkout || checkout.userId !== userId) throw new CheckoutNotFoundException({ checkoutId });
    return checkout;
  }

  /** One seller "bucket" per Checkout — derived from its InventoryReservations, which already exist for every seller in the checkout (spec section 24-25: quotes are requested per seller before Orders exist). */
  private async loadSellerContexts(checkoutId: string): Promise<SellerContext[]> {
    const reservations = await this.prisma.inventoryReservation.findMany({
      where: { checkoutId },
      include: { sellerOffer: { include: { sellerOrganization: true, productVariant: true } } },
    });

    const bySeller = new Map<string, SellerContext>();
    for (const reservation of reservations) {
      const seller = reservation.sellerOffer.sellerOrganization;
      const existing = bySeller.get(seller.id);
      const line = {
        quantity: reservation.quantity,
        unitPriceAmount: reservation.sellerOffer.priceAmount,
        variantWeightValue: reservation.sellerOffer.productVariant.weightValue ? Number(reservation.sellerOffer.productVariant.weightValue) : null,
        variantWeightUnit: reservation.sellerOffer.productVariant.weightUnit,
      };
      if (existing) {
        existing.shippingPackageLines.push(line);
      } else {
        bySeller.set(seller.id, {
          sellerOrgId: seller.id,
          sellerOrganization: seller,
          // SellerOrganization has no street address in this catalog (only
          // countryCode/city) — everything else is explicitly unknown
          // rather than fabricated (spec section 8).
          pickupAddress: { recipient: seller.name, phone: null, addressLine: null, city: seller.city, region: null, countryCode: seller.countryCode, instructions: null },
          shippingPackageLines: [line],
        });
      }
    }
    return [...bySeller.values()];
  }

  private async loadDeliveryAddress(checkout: { addressId: string | null }): Promise<AddressSnapshotDto> {
    if (!checkout.addressId) return { recipient: null, phone: null, addressLine: null, city: null, region: null, countryCode: null, instructions: null };
    const address = await this.prisma.customerAddress.findUnique({ where: { id: checkout.addressId } });
    if (!address) return { recipient: null, phone: null, addressLine: null, city: null, region: null, countryCode: null, instructions: null };
    return { recipient: address.recipient, phone: address.phone, addressLine: address.addressLine, city: address.city, region: address.region, countryCode: address.countryCode, instructions: address.instructions };
  }

  private async requestFreshQuotes(checkoutId: string, seller: SellerContext, deliveryAddress: AddressSnapshotDto): Promise<ShippingQuote[]> {
    const shippingPackage = buildShippingPackage(
      seller.shippingPackageLines.map((l) => ({ quantity: l.quantity, unitPriceAmount: l.unitPriceAmount, variantWeightValue: l.variantWeightValue, variantWeightUnit: l.variantWeightUnit as never })),
    );
    const created: ShippingQuote[] = [];
    for (const gateway of this.shippingProviders.listEnabled()) {
      if (!gateway.capabilities.supportsQuote) continue;
      const result = await gateway.getQuote({ pickupAddress: seller.pickupAddress, deliveryAddress, shippingPackage });
      if (result.status !== "AVAILABLE") continue;
      for (const option of result.quotes) {
        const quote = await this.prisma.shippingQuote.create({
          data: {
            checkoutId,
            sellerOrgId: seller.sellerOrgId,
            provider: gateway.provider,
            serviceLevel: option.serviceLevel,
            priceIrr: option.priceIrr,
            estimatedPickupMinutes: option.estimatedPickupMinutes,
            estimatedDeliveryMinutes: option.estimatedDeliveryMinutes,
            providerQuoteId: option.providerQuoteId,
            status: ShippingQuoteStatus.AVAILABLE,
            expiresAt: new Date(Date.now() + option.expiresInMinutes * 60_000),
          },
        });
        created.push(quote);
      }
    }
    await this.events.publish("ShippingQuoteCreated", { checkoutId, sellerOrgId: seller.sellerOrgId, count: created.length }, { aggregateType: "Checkout", aggregateId: checkoutId });
    return created;
  }

  private toOptionsDto(seller: SellerContext, quotes: ShippingQuote[]): SellerShippingOptionsDto {
    return {
      sellerOrganization: toSellerSummaryDto(seller.sellerOrganization as never),
      quotes: quotes.map(toShippingQuoteDto),
    };
  }

  async getShippingOptions(userId: string, checkoutId: string): Promise<SellerShippingOptionsDto[]> {
    const checkout = await this.loadOwnedCheckout(userId, checkoutId);
    const sellers = await this.loadSellerContexts(checkoutId);
    const deliveryAddress = await this.loadDeliveryAddress(checkout);
    const now = new Date();

    const result: SellerShippingOptionsDto[] = [];
    for (const seller of sellers) {
      let quotes = await this.prisma.shippingQuote.findMany({
        where: { checkoutId, sellerOrgId: seller.sellerOrgId, OR: [{ status: ShippingQuoteStatus.SELECTED }, { status: ShippingQuoteStatus.AVAILABLE, expiresAt: { gt: now } }] },
        orderBy: { createdAt: "desc" },
      });
      if (quotes.length === 0) quotes = await this.requestFreshQuotes(checkoutId, seller, deliveryAddress);
      result.push(this.toOptionsDto(seller, quotes));
    }
    return result;
  }

  async refreshShippingOptions(userId: string, checkoutId: string): Promise<SellerShippingOptionsDto[]> {
    const checkout = await this.loadOwnedCheckout(userId, checkoutId);
    const sellers = await this.loadSellerContexts(checkoutId);
    const deliveryAddress = await this.loadDeliveryAddress(checkout);

    await this.prisma.shippingQuote.updateMany({
      where: { checkoutId, status: ShippingQuoteStatus.AVAILABLE },
      data: { status: ShippingQuoteStatus.EXPIRED },
    });

    const result: SellerShippingOptionsDto[] = [];
    for (const seller of sellers) {
      const selected = await this.prisma.shippingQuote.findMany({ where: { checkoutId, sellerOrgId: seller.sellerOrgId, status: ShippingQuoteStatus.SELECTED } });
      const fresh = await this.requestFreshQuotes(checkoutId, seller, deliveryAddress);
      result.push(this.toOptionsDto(seller, [...selected, ...fresh]));
    }
    return result;
  }

  async selectShippingQuote(userId: string, checkoutId: string, quoteId: string): Promise<SellerShippingOptionsDto[]> {
    await this.loadOwnedCheckout(userId, checkoutId);
    const quote = await this.prisma.shippingQuote.findUnique({ where: { id: quoteId } });
    if (!quote || quote.checkoutId !== checkoutId) throw new ShippingQuoteNotFoundException({ quoteId });

    if (quote.status === ShippingQuoteStatus.SELECTED) {
      // Duplicate selection of the same quote is a safe no-op (spec section 21).
    } else {
      if (quote.status === ShippingQuoteStatus.EXPIRED || quote.expiresAt.getTime() <= Date.now()) throw new ShippingQuoteExpiredException({ quoteId });
      if (quote.status !== ShippingQuoteStatus.AVAILABLE) throw new ShippingQuoteNotEligibleException({ quoteId, status: quote.status });

      await this.prisma.$transaction(async (tx) => {
        await tx.shippingQuote.updateMany({
          where: { checkoutId, sellerOrgId: quote.sellerOrgId, status: ShippingQuoteStatus.SELECTED },
          data: { status: ShippingQuoteStatus.AVAILABLE },
        });
        const claimed = await tx.shippingQuote.updateMany({ where: { id: quoteId, status: ShippingQuoteStatus.AVAILABLE }, data: { status: ShippingQuoteStatus.SELECTED } });
        if (claimed.count !== 1) throw new ShippingQuoteExpiredException({ quoteId });
        await this.recalculateCheckoutShipping(tx, checkoutId);
      });
      await this.events.publish("ShippingQuoteSelected", { checkoutId, quoteId, sellerOrgId: quote.sellerOrgId }, { aggregateType: "Checkout", aggregateId: checkoutId });
    }

    return this.getShippingOptions(userId, checkoutId);
  }

  /** Checkout.deliveryAmount/totalAmount become quote-driven the moment any quote is selected for this checkout — sum of each seller's currently SELECTED quote, 0 for a seller with none yet (spec section 24). A checkout that never selects a quote keeps the original DeliveryMethod-based flat amount untouched (see CheckoutService). */
  private async recalculateCheckoutShipping(tx: Prisma.TransactionClient, checkoutId: string): Promise<void> {
    const checkout = await tx.checkout.findUniqueOrThrow({ where: { id: checkoutId } });
    const selected = await tx.shippingQuote.findMany({ where: { checkoutId, status: ShippingQuoteStatus.SELECTED } });
    const deliveryAmount = selected.reduce((sum, q) => sum + q.priceIrr, 0);
    const totalAmount = checkout.subtotalAmount + deliveryAmount - checkout.discountAmount;
    await tx.checkout.update({ where: { id: checkoutId }, data: { deliveryAmount, totalAmount } });
  }

  // ---------------------------------------------------------------------
  // Fulfillment creation (post-payment)
  // ---------------------------------------------------------------------

  /** Called from CheckoutService.finalizeSuccessfulPayment inside the same transaction that creates Orders — one Fulfillment per seller Order (spec section 3), idempotent via `@@unique([orderId, sequenceNumber])`. */
  async createFulfillmentsForOrders(tx: Prisma.TransactionClient, checkoutId: string, orders: { id: string; sellerOrganizationId: string }[]): Promise<void> {
    for (const order of orders) {
      const fullOrder = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
      const seller = await tx.sellerOrganization.findUniqueOrThrow({ where: { id: order.sellerOrganizationId } });
      const pickupAddress: AddressSnapshotDto = { recipient: seller.name, phone: null, addressLine: null, city: seller.city, region: null, countryCode: seller.countryCode, instructions: null };
      const deliveryAddress = toAddressSnapshotDto(fullOrder.shippingAddressSnapshot);

      let fulfillment: Fulfillment;
      try {
        fulfillment = await tx.fulfillment.create({
          data: {
            orderId: order.id,
            sellerOrgId: order.sellerOrganizationId,
            sequenceNumber: 1,
            pickupAddressSnapshot: pickupAddress as unknown as Prisma.InputJsonValue,
            deliveryAddressSnapshot: deliveryAddress as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          fulfillment = await tx.fulfillment.findUniqueOrThrow({ where: { orderId_sequenceNumber: { orderId: order.id, sequenceNumber: 1 } } });
        } else {
          throw error;
        }
      }

      await this.events.publish("FulfillmentCreated", { fulfillmentId: fulfillment.id, orderId: order.id, sellerOrgId: order.sellerOrganizationId }, { tx, aggregateType: "Fulfillment", aggregateId: fulfillment.id });
      if (fulfillment.status === FulfillmentStatus.PENDING) {
        await this.transitions.transition(fulfillment.id, FulfillmentStatus.AWAITING_SELLER_PREPARATION, { tx });
      }

      // Backfill the seller's selected quote (if any) with the now-existing Order id — see ShippingQuote's doc comment.
      await tx.shippingQuote.updateMany({
        where: { checkoutId, sellerOrgId: order.sellerOrganizationId, status: ShippingQuoteStatus.SELECTED },
        data: { orderId: order.id },
      });
    }
  }

  // ---------------------------------------------------------------------
  // Seller ops actions (spec section 27 — minimal, owner-authorized only;
  // no Seller OS/team auth model exists yet, see README Known limitations)
  // ---------------------------------------------------------------------

  private async loadOwnedFulfillment(userId: string, fulfillmentId: string): Promise<Fulfillment & { order: { userId: string | null; checkoutId: string | null } }> {
    const fulfillment = await this.prisma.fulfillment.findUnique({ where: { id: fulfillmentId }, include: { order: { select: { userId: true, checkoutId: true } } } });
    if (!fulfillment) throw new FulfillmentNotFoundException({ fulfillmentId });
    if (fulfillment.order.userId !== userId) throw new FulfillmentNotFoundException({ fulfillmentId });
    return fulfillment;
  }

  async markReadyForPickup(userId: string, fulfillmentId: string): Promise<Fulfillment> {
    await this.loadOwnedFulfillment(userId, fulfillmentId);
    return this.transitions.transition(fulfillmentId, FulfillmentStatus.READY_FOR_PICKUP);
  }

  private async resolveShipmentProvider(fulfillment: Fulfillment): Promise<{ provider: ShippingProvider; providerQuoteId: string | null }> {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: fulfillment.orderId } });
    // A marketplace-origin Order (Handoff 09) has no checkoutId/ShippingQuote — falls through to
    // the DEV default below, same as any checkout Order that never selected a quote.
    const selectedQuote = order.checkoutId
      ? await this.prisma.shippingQuote.findFirst({
          where: { checkoutId: order.checkoutId, sellerOrgId: fulfillment.sellerOrgId, status: ShippingQuoteStatus.SELECTED },
        })
      : null;
    if (selectedQuote) return { provider: selectedQuote.provider, providerQuoteId: selectedQuote.providerQuoteId };
    return { provider: ShippingProvider.DEV, providerQuoteId: null };
  }

  private async buildPackageForFulfillment(orderId: string) {
    const items = await this.prisma.orderItem.findMany({ where: { orderId }, include: { productVariant: true } });
    return buildShippingPackage(
      items.map((item) => ({
        quantity: item.quantity,
        unitPriceAmount: item.unitPrice,
        variantWeightValue: item.productVariant.weightValue ? Number(item.productVariant.weightValue) : null,
        variantWeightUnit: item.productVariant.weightUnit,
      })),
    );
  }

  /**
   * The "request courier" ops action (spec section 27) — this is also
   * where Shipment creation happens. Concurrency-safe (spec section 21,
   * Race A): the Shipment row is inserted (claiming `sequenceNumber: 1`)
   * *before* the provider is ever called, so two concurrent calls race on
   * the DB unique constraint rather than both reaching the provider — only
   * the winner calls `gateway.createShipment`, the loser reuses its result.
   */
  async requestCourier(userId: string, fulfillmentId: string): Promise<{ fulfillment: Fulfillment; shipment: Shipment }> {
    const fulfillment = await this.loadOwnedFulfillment(userId, fulfillmentId);

    if (fulfillment.status !== FulfillmentStatus.READY_FOR_PICKUP) {
      const existingShipment = await this.prisma.shipment.findUnique({ where: { fulfillmentId_sequenceNumber: { fulfillmentId, sequenceNumber: 1 } } });
      if (existingShipment) return { fulfillment, shipment: existingShipment };
      throw new FulfillmentNotFoundException({ fulfillmentId, reason: "No shipment exists and fulfillment is not ready for pickup" });
    }

    const { provider, providerQuoteId } = await this.resolveShipmentProvider(fulfillment);

    let shipmentRow: Shipment;
    let isRetry = false;
    try {
      shipmentRow = await this.prisma.shipment.create({
        data: {
          fulfillmentId,
          sequenceNumber: 1,
          provider,
          providerQuoteId,
          status: ShipmentStatus.CREATED,
          pickupAddressSnapshot: fulfillment.pickupAddressSnapshot as Prisma.InputJsonValue,
          deliveryAddressSnapshot: fulfillment.deliveryAddressSnapshot as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      const existing = await this.prisma.shipment.findUniqueOrThrow({ where: { fulfillmentId_sequenceNumber: { fulfillmentId, sequenceNumber: 1 } } });
      if (existing.status !== ShipmentStatus.FAILED) {
        // A concurrent winner already created (or is creating) this shipment — idempotent reuse, no second provider call (Race A).
        return { fulfillment, shipment: existing };
      }
      shipmentRow = existing;
      isRetry = true;
    }

    const shippingPackage = await this.buildPackageForFulfillment(fulfillment.orderId);
    const gateway = this.shippingProviders.resolve(provider);
    const result = await gateway.createShipment({
      pickupAddress: toAddressSnapshotDto(shipmentRow.pickupAddressSnapshot),
      deliveryAddress: toAddressSnapshotDto(shipmentRow.deliveryAddressSnapshot),
      shippingPackage,
      providerQuoteId: providerQuoteId ?? undefined,
    });

    if (result.status === "FAILED") {
      await this.prisma.shipment.update({
        where: { id: shipmentRow.id },
        data: { status: ShipmentStatus.FAILED, providerPayloadSnapshot: { failureMessage: result.failureMessage ?? "Unknown failure", retried: isRetry } },
      });
      throw new ShipmentCreationFailedException({ fulfillmentId, provider, failureMessage: result.failureMessage });
    }

    const updatedShipment = await this.prisma.shipment.update({
      where: { id: shipmentRow.id },
      data: {
        status: ShipmentStatus.REQUESTED,
        providerShipmentId: result.providerShipmentId,
        trackingCode: result.trackingCode,
        estimatedPickupAt: result.estimatedPickupAt,
        estimatedDeliveryAt: result.estimatedDeliveryAt,
      },
    });
    const updatedFulfillment = await this.transitions.transition(fulfillmentId, FulfillmentStatus.PICKUP_REQUESTED);
    await this.events.publish("ShipmentCreated", { shipmentId: updatedShipment.id, fulfillmentId, provider }, { aggregateType: "Shipment", aggregateId: updatedShipment.id });

    return { fulfillment: updatedFulfillment, shipment: updatedShipment };
  }

  async cancelFulfillment(userId: string, fulfillmentId: string): Promise<Fulfillment> {
    await this.loadOwnedFulfillment(userId, fulfillmentId);
    const shipment = await this.prisma.shipment.findUnique({ where: { fulfillmentId_sequenceNumber: { fulfillmentId, sequenceNumber: 1 } } });

    const cancelableStatuses: ShipmentStatus[] = [ShipmentStatus.CREATED, ShipmentStatus.REQUESTED, ShipmentStatus.ASSIGNED];
    if (shipment && shipment.providerShipmentId && cancelableStatuses.includes(shipment.status)) {
      const gateway = this.shippingProviders.resolve(shipment.provider);
      const result = await gateway.cancelShipment(shipment.providerShipmentId);
      if (result.status === "CANCELED") {
        await this.prisma.shipment.update({ where: { id: shipment.id }, data: { status: ShipmentStatus.CANCELED } });
      }
    }

    return this.transitions.transition(fulfillmentId, FulfillmentStatus.CANCELED);
  }

  // ---------------------------------------------------------------------
  // Customer-facing reads
  // ---------------------------------------------------------------------

  private async loadOwnedOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) throw new OrderNotFoundException({ orderId });
    return order;
  }

  async getFulfillmentForOrder(userId: string, orderId: string): Promise<Fulfillment | null> {
    await this.loadOwnedOrder(userId, orderId);
    return this.prisma.fulfillment.findUnique({ where: { orderId_sequenceNumber: { orderId, sequenceNumber: 1 } } });
  }

  async getShipmentForOrder(userId: string, orderId: string): Promise<Shipment | null> {
    const fulfillment = await this.getFulfillmentForOrder(userId, orderId);
    if (!fulfillment) return null;
    return this.prisma.shipment.findUnique({ where: { fulfillmentId_sequenceNumber: { fulfillmentId: fulfillment.id, sequenceNumber: 1 } } });
  }

  // ---------------------------------------------------------------------
  // Shared status-mirroring logic (webhook + reconciliation both call this)
  // ---------------------------------------------------------------------

  async findShipmentByProviderReference(provider: ShippingProvider, providerShipmentId: string): Promise<Shipment | null> {
    return this.prisma.shipment.findFirst({ where: { provider, providerShipmentId } });
  }

  /**
   * The one place a Shipment's canonical `status` is ever written after
   * creation (spec section 19) — both the webhook controller and
   * ReconciliationService call this, never mutating `status` directly.
   * Enforces, in order: UNKNOWN is never written (spec section 6: "UNKNOWN
   * must never imply success"); a terminal local status is never
   * overwritten (spec section 19: "Local: DELIVERED, Provider: IN_TRANSIT →
   * keep DELIVERED"); and a non-terminal move must be forward-only along
   * the canonical happy-path ordering (FAILED/CANCELED are always
   * "forward" from any non-terminal state). Returns `applied: false` for
   * every one of those no-op cases — never throws for them, since "the
   * provider disagrees with local state" is an expected, safe-to-ignore
   * outcome here, not an error.
   */
  async applyShipmentStatus(shipmentId: string, canonicalStatus: ShipmentStatus, tx?: Prisma.TransactionClient): Promise<{ applied: boolean }> {
    const run = async (client: Prisma.TransactionClient): Promise<{ applied: boolean }> => {
      const shipment = await client.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) return { applied: false };
      if (canonicalStatus === ShipmentStatus.UNKNOWN) return { applied: false };
      if (shipment.status === canonicalStatus) return { applied: false };

      const terminal: ReadonlySet<ShipmentStatus> = new Set([ShipmentStatus.DELIVERED, ShipmentStatus.FAILED, ShipmentStatus.CANCELED]);
      if (terminal.has(shipment.status)) return { applied: false };

      const happyPathOrder: ShipmentStatus[] = [
        ShipmentStatus.CREATED,
        ShipmentStatus.REQUESTED,
        ShipmentStatus.ASSIGNED,
        ShipmentStatus.PICKED_UP,
        ShipmentStatus.IN_TRANSIT,
        ShipmentStatus.OUT_FOR_DELIVERY,
        ShipmentStatus.DELIVERED,
      ];
      const isForward = terminal.has(canonicalStatus) || happyPathOrder.indexOf(canonicalStatus) > happyPathOrder.indexOf(shipment.status);
      if (!isForward) return { applied: false };

      const data: Prisma.ShipmentUpdateInput = { status: canonicalStatus };
      if (canonicalStatus === ShipmentStatus.PICKED_UP) data.actualPickupAt = new Date();
      if (canonicalStatus === ShipmentStatus.DELIVERED) data.actualDeliveryAt = new Date();
      await client.shipment.update({ where: { id: shipmentId }, data });

      const fulfillmentStatus = SHIPMENT_TO_FULFILLMENT_STATUS[canonicalStatus];
      if (fulfillmentStatus) {
        await this.transitions.transition(shipment.fulfillmentId, fulfillmentStatus, {
          tx: client,
          failureCode: canonicalStatus === ShipmentStatus.FAILED ? "SHIPMENT_FAILED" : undefined,
          failureReason: canonicalStatus === ShipmentStatus.FAILED ? "The delivery provider reported this shipment as failed." : undefined,
        });
      }

      const eventType = SHIPMENT_EVENT_BY_STATUS[canonicalStatus];
      if (eventType) {
        await this.events.publish(eventType, { shipmentId, fulfillmentId: shipment.fulfillmentId, status: canonicalStatus }, { tx: client, aggregateType: "Shipment", aggregateId: shipmentId });
      }

      return { applied: true };
    };

    if (tx) return run(tx);
    return this.prisma.$transaction(run);
  }
}

const SHIPMENT_TO_FULFILLMENT_STATUS: Partial<Record<ShipmentStatus, FulfillmentStatus>> = {
  [ShipmentStatus.ASSIGNED]: FulfillmentStatus.PICKUP_ASSIGNED,
  [ShipmentStatus.PICKED_UP]: FulfillmentStatus.PICKED_UP,
  [ShipmentStatus.IN_TRANSIT]: FulfillmentStatus.IN_TRANSIT,
  [ShipmentStatus.OUT_FOR_DELIVERY]: FulfillmentStatus.OUT_FOR_DELIVERY,
  [ShipmentStatus.DELIVERED]: FulfillmentStatus.DELIVERED,
  [ShipmentStatus.FAILED]: FulfillmentStatus.FAILED,
  [ShipmentStatus.CANCELED]: FulfillmentStatus.CANCELED,
};

const SHIPMENT_EVENT_BY_STATUS: Partial<Record<ShipmentStatus, DomainEventType>> = {
  [ShipmentStatus.ASSIGNED]: "ShipmentAssigned",
  [ShipmentStatus.PICKED_UP]: "ShipmentPickedUp",
  [ShipmentStatus.IN_TRANSIT]: "ShipmentInTransit",
  [ShipmentStatus.OUT_FOR_DELIVERY]: "ShipmentOutForDelivery",
  [ShipmentStatus.DELIVERED]: "ShipmentDelivered",
  [ShipmentStatus.FAILED]: "ShipmentFailed",
  [ShipmentStatus.CANCELED]: "ShipmentCanceled",
};
