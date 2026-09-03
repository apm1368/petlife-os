import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationCategory, NotificationPriority, SellerMembershipRole, SellerMembershipStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationOrchestratorService } from "./notification-orchestrator.service";
import { NotificationDeepLinks } from "./notification-deeplink.util";

/**
 * Reacts to a representative set of existing H01-H09 domain events (spec:
 * "identify relevant existing events... integrate incrementally, not the
 * entire codebase"). Never imports BookingModule/CommerceModule/etc — every
 * lookup goes through PrismaService directly, the same "no module cycle"
 * pattern RefundsService/ShippingOrchestrator already established for
 * cross-module reads. Every handler calls only NotificationOrchestratorService
 * — never Prisma's notification tables directly — and always passes the
 * `domainEventId` (this listener's own second parameter, populated by
 * DomainEventsService.publish's extra emit() argument) as the idempotency
 * anchor.
 *
 * A handler that finds nothing to notify (e.g. a booking with no matching
 * user, which cannot actually happen given the schema's own FK constraints)
 * logs and returns rather than throwing — EventEmitter2 does not await these
 * handlers, so a thrown error here can only ever be logged, never surfaced
 * to the original request (spec: "messaging failure should not roll back
 * the underlying business transaction").
 */
@Injectable()
export class NotificationEventsListener {
  private readonly logger = new Logger(NotificationEventsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: NotificationOrchestratorService,
  ) {}

  private async safely(label: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(`Notification handling failed for ${label}`, error instanceof Error ? error.stack : undefined);
    }
  }

  @OnEvent("ServiceBookingConfirmed")
  onBookingConfirmed(payload: { bookingId: string }, domainEventId: string): Promise<void> {
    return this.safely("ServiceBookingConfirmed", async () => {
      const booking = await this.prisma.booking.findUnique({ where: { id: payload.bookingId }, select: { userId: true } });
      if (!booking) return;
      await this.orchestrator.notify({
        userId: booking.userId,
        type: "booking.confirmed",
        category: NotificationCategory.BOOKING,
        deepLink: NotificationDeepLinks.booking(payload.bookingId),
        entityType: "Booking",
        entityId: payload.bookingId,
        domainEventId,
      });
    });
  }

  @OnEvent("ServiceBookingCancelled")
  onBookingCancelled(payload: { bookingId: string }, domainEventId: string): Promise<void> {
    return this.safely("ServiceBookingCancelled", async () => {
      const booking = await this.prisma.booking.findUnique({ where: { id: payload.bookingId }, select: { userId: true } });
      if (!booking) return;
      await this.orchestrator.notify({
        userId: booking.userId,
        type: "booking.cancelled",
        category: NotificationCategory.BOOKING,
        deepLink: NotificationDeepLinks.booking(payload.bookingId),
        entityType: "Booking",
        entityId: payload.bookingId,
        domainEventId,
      });
    });
  }

  @OnEvent("PaymentSucceeded")
  onPaymentSucceeded(payload: { checkoutId: string }, domainEventId: string): Promise<void> {
    return this.safely("PaymentSucceeded", async () => {
      const checkout = await this.prisma.checkout.findUnique({ where: { id: payload.checkoutId }, select: { userId: true, cart: { select: { _count: { select: { lines: true } } } } } });
      // Handoff 16 — a subscription billing attempt's PaymentIntent is
      // wired to a minimal internal Checkout/Cart shell (never a real cart
      // with lines) purely to satisfy PaymentIntent.checkoutId's FK; see
      // SubscriptionBillingService's own doc comment. This generic
      // "payment.succeeded" → "see My Orders" copy would be actively wrong
      // for that case (SubscriptionNotificationListener sends the correct
      // "subscription.started"/"subscription.renewal succeeded" copy
      // instead), so a checkout whose cart has no line items at all is
      // never a real commerce purchase and is skipped here.
      if (!checkout || checkout.cart._count.lines === 0) return;
      await this.orchestrator.notify({
        userId: checkout.userId,
        type: "payment.succeeded",
        category: NotificationCategory.PAYMENT,
        deepLink: NotificationDeepLinks.myOrders(),
        entityType: "Checkout",
        entityId: payload.checkoutId,
        domainEventId,
      });
    });
  }

  @OnEvent("PaymentFailed")
  onPaymentFailed(payload: { checkoutId: string }, domainEventId: string): Promise<void> {
    return this.safely("PaymentFailed", async () => {
      const checkout = await this.prisma.checkout.findUnique({ where: { id: payload.checkoutId }, select: { userId: true, cart: { select: { _count: { select: { lines: true } } } } } });
      // See the matching guard in onPaymentSucceeded above.
      if (!checkout || checkout.cart._count.lines === 0) return;
      await this.orchestrator.notify({
        userId: checkout.userId,
        type: "payment.failed",
        category: NotificationCategory.PAYMENT,
        priority: NotificationPriority.HIGH,
        deepLink: NotificationDeepLinks.checkout(payload.checkoutId),
        entityType: "Checkout",
        entityId: payload.checkoutId,
        domainEventId,
      });
    });
  }

  @OnEvent("RefundSucceeded")
  onRefundSucceeded(payload: { refundId: string; orderId: string }, domainEventId: string): Promise<void> {
    return this.safely("RefundSucceeded", async () => {
      const order = await this.prisma.order.findUnique({ where: { id: payload.orderId }, select: { userId: true } });
      if (!order?.userId) return;
      await this.orchestrator.notify({
        userId: order.userId,
        type: "refund.completed",
        category: NotificationCategory.PAYMENT,
        deepLink: NotificationDeepLinks.order(payload.orderId),
        entityType: "Order",
        entityId: payload.orderId,
        domainEventId,
      });
    });
  }

  @OnEvent("ShipmentDelivered")
  onShipmentDelivered(payload: { shipmentId: string; fulfillmentId: string }, domainEventId: string): Promise<void> {
    return this.safely("ShipmentDelivered", async () => {
      const fulfillment = await this.prisma.fulfillment.findUnique({ where: { id: payload.fulfillmentId }, select: { order: { select: { id: true, userId: true } } } });
      if (!fulfillment?.order.userId) return;
      await this.orchestrator.notify({
        userId: fulfillment.order.userId,
        type: "shipment.delivered",
        category: NotificationCategory.DELIVERY,
        deepLink: NotificationDeepLinks.order(fulfillment.order.id),
        entityType: "Order",
        entityId: fulfillment.order.id,
        domainEventId,
      });
    });
  }

  @OnEvent("ShipmentFailed")
  onShipmentFailed(payload: { shipmentId: string; fulfillmentId: string }, domainEventId: string): Promise<void> {
    return this.safely("ShipmentFailed", async () => {
      const fulfillment = await this.prisma.fulfillment.findUnique({ where: { id: payload.fulfillmentId }, select: { order: { select: { id: true, userId: true } } } });
      if (!fulfillment?.order.userId) return;
      await this.orchestrator.notify({
        userId: fulfillment.order.userId,
        type: "shipment.failed",
        category: NotificationCategory.DELIVERY,
        priority: NotificationPriority.HIGH,
        deepLink: NotificationDeepLinks.order(fulfillment.order.id),
        entityType: "Order",
        entityId: fulfillment.order.id,
        domainEventId,
      });
    });
  }

  /** Fans out to every ACTIVE OWNER/ADMIN of the seller organization — one Notification row per recipient, isolation preserved by construction (each row's own `userId`). Never floods a seller: one notification per sync-failure event, not per retry. */
  private async notifySellerAdmins(sellerOrganizationId: string, type: string, entityType: string, entityId: string, deepLink: string, domainEventId: string): Promise<void> {
    const admins = await this.prisma.sellerMembership.findMany({
      where: { sellerOrganizationId, status: SellerMembershipStatus.ACTIVE, role: { in: [SellerMembershipRole.OWNER, SellerMembershipRole.ADMIN] } },
      select: { userId: true },
    });
    for (const admin of admins) {
      await this.orchestrator.notify({
        userId: admin.userId,
        type,
        category: NotificationCategory.SELLER,
        sellerOrganizationId,
        deepLink,
        entityType,
        entityId,
        domainEventId,
      });
    }
  }

  @OnEvent("MarketplaceListingSyncFailed")
  onListingSyncFailed(payload: { listingId: string; sellerOrganizationId: string }, domainEventId: string): Promise<void> {
    return this.safely("MarketplaceListingSyncFailed", () =>
      this.notifySellerAdmins(payload.sellerOrganizationId, "marketplace.listing_degraded", "MarketplaceListing", payload.listingId, NotificationDeepLinks.sellerChannels(), domainEventId),
    );
  }

  @OnEvent("MarketplaceInventoryMismatchDetected")
  onInventoryMismatch(payload: { listingId: string; sellerOrganizationId: string }, domainEventId: string): Promise<void> {
    return this.safely("MarketplaceInventoryMismatchDetected", () =>
      this.notifySellerAdmins(payload.sellerOrganizationId, "marketplace.inventory_mismatch", "MarketplaceListing", payload.listingId, NotificationDeepLinks.sellerInventory(), domainEventId),
    );
  }

  @OnEvent("ServiceAccessGranted")
  onPetAccessGranted(payload: { bookingId: string; petId: string }, domainEventId: string): Promise<void> {
    return this.safely("ServiceAccessGranted", async () => {
      const booking = await this.prisma.booking.findUnique({ where: { id: payload.bookingId }, select: { userId: true } });
      if (!booking) return;
      await this.orchestrator.notify({
        userId: booking.userId,
        type: "pet_access.granted",
        category: NotificationCategory.PET_ACCESS,
        petId: payload.petId,
        deepLink: NotificationDeepLinks.pet(payload.petId),
        entityType: "PetAccessGrant",
        entityId: payload.petId,
        domainEventId,
      });
    });
  }
}
