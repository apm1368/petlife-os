import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { IdempotencyInterceptor } from "../../../common/idempotency/idempotency.interceptor";
import type { SessionUser } from "../../../common/session/session.service";
import { FulfillmentStatus, ShipmentStatus, type FulfillmentDto, type ShipmentDto, type ShipmentTrackingDto, type ShipmentTrackingEventDto } from "@petlife/types";
import { ShippingOrchestrator } from "./shipping-orchestrator.service";
import { ShippingReconciliationService } from "./shipping-reconciliation.service";
import { toFulfillmentDto, toShipmentDto } from "./logistics-dto.mapper";
import { SelectShippingQuoteDto } from "./dto/shipping.dto";

/** Checkout-time shipping-quote routes (spec section 26, adapted to this project's ShippingQuote-per-checkout model — see ShippingQuote's own doc comment for why). Declared here (LogisticsModule) rather than inside CheckoutModule, mirroring PaymentWebhooksController's precedent of adding routes to another module's prefix without a cross-module import. */
@Controller("checkout")
@UseGuards(SessionAuthGuard)
export class CheckoutShippingController {
  constructor(private readonly shipping: ShippingOrchestrator) {}

  @Get(":id/shipping-quotes")
  getShippingOptions(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.shipping.getShippingOptions(user.id, id);
  }

  @Post(":id/shipping-quotes/refresh")
  refreshShippingOptions(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.shipping.refreshShippingOptions(user.id, id);
  }

  @Post(":id/shipping-quotes/select")
  @UseInterceptors(IdempotencyInterceptor)
  selectShippingQuote(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() dto: SelectShippingQuoteDto) {
    return this.shipping.selectShippingQuote(user.id, id, dto.quoteId);
  }
}

/** A fixed checklist of tracking milestones (spec section 32) — never a live-only feed; `reached`/`occurredAt` are filled in from the actual Fulfillment/Shipment rows. */
function buildTimeline(fulfillment: FulfillmentDto | null, shipment: ShipmentDto | null): ShipmentTrackingEventDto[] {
  const timeline: ShipmentTrackingEventDto[] = [];
  if (fulfillment) {
    timeline.push({ milestone: FulfillmentStatus.AWAITING_SELLER_PREPARATION, reached: true, occurredAt: fulfillment.createdAt });
    timeline.push({ milestone: FulfillmentStatus.READY_FOR_PICKUP, reached: !!fulfillment.readyAt, occurredAt: fulfillment.readyAt });
    timeline.push({ milestone: FulfillmentStatus.PICKUP_REQUESTED, reached: !!fulfillment.pickupRequestedAt, occurredAt: fulfillment.pickupRequestedAt });
  }
  timeline.push({ milestone: ShipmentStatus.ASSIGNED, reached: !!shipment && [ShipmentStatus.ASSIGNED, ShipmentStatus.PICKED_UP, ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED].includes(shipment.status), occurredAt: null });
  timeline.push({ milestone: ShipmentStatus.PICKED_UP, reached: !!shipment?.actualPickupAt, occurredAt: shipment?.actualPickupAt ?? null });
  timeline.push({ milestone: ShipmentStatus.IN_TRANSIT, reached: !!shipment && [ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED].includes(shipment.status), occurredAt: null });
  timeline.push({ milestone: ShipmentStatus.OUT_FOR_DELIVERY, reached: !!shipment && [ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED].includes(shipment.status), occurredAt: null });
  timeline.push({ milestone: ShipmentStatus.DELIVERED, reached: !!shipment?.actualDeliveryAt, occurredAt: shipment?.actualDeliveryAt ?? null });
  return timeline;
}

/** Order-scoped fulfillment/shipment/tracking + minimal ops actions (spec sections 26-27). Ops actions are owner-authorized only this phase — no Seller OS/team auth model exists yet (see README Known limitations; H09 owns building that). */
@Controller("orders")
@UseGuards(SessionAuthGuard)
export class OrderLogisticsController {
  constructor(
    private readonly shipping: ShippingOrchestrator,
    private readonly reconciliation: ShippingReconciliationService,
  ) {}

  @Get(":orderId/fulfillment")
  async getFulfillment(@CurrentUser() user: SessionUser, @Param("orderId") orderId: string) {
    const fulfillment = await this.shipping.getFulfillmentForOrder(user.id, orderId);
    return fulfillment ? toFulfillmentDto(fulfillment) : null;
  }

  @Get(":orderId/shipment")
  async getShipment(@CurrentUser() user: SessionUser, @Param("orderId") orderId: string) {
    const shipment = await this.shipping.getShipmentForOrder(user.id, orderId);
    return shipment ? toShipmentDto(shipment) : null;
  }

  @Get(":orderId/tracking")
  async getTracking(@CurrentUser() user: SessionUser, @Param("orderId") orderId: string): Promise<ShipmentTrackingDto> {
    const fulfillmentRow = await this.shipping.getFulfillmentForOrder(user.id, orderId);
    const shipmentRow = await this.shipping.getShipmentForOrder(user.id, orderId);
    const fulfillment = fulfillmentRow ? toFulfillmentDto(fulfillmentRow) : null;
    const shipment = shipmentRow ? toShipmentDto(shipmentRow) : null;
    const lastUpdatedAt = [fulfillment?.updatedAt, shipment?.updatedAt].filter((v): v is string => !!v).sort().at(-1) ?? null;
    return { fulfillment, shipment, timeline: buildTimeline(fulfillment, shipment), lastUpdatedAt };
  }

  @Post(":orderId/fulfillment/ready-for-pickup")
  async markReadyForPickup(@CurrentUser() user: SessionUser, @Param("orderId") orderId: string) {
    const fulfillment = await this.shipping.getFulfillmentForOrder(user.id, orderId);
    if (!fulfillment) return null;
    return toFulfillmentDto(await this.shipping.markReadyForPickup(user.id, fulfillment.id));
  }

  @Post(":orderId/fulfillment/request-courier")
  @UseInterceptors(IdempotencyInterceptor)
  async requestCourier(@CurrentUser() user: SessionUser, @Param("orderId") orderId: string) {
    const fulfillment = await this.shipping.getFulfillmentForOrder(user.id, orderId);
    if (!fulfillment) return null;
    const { fulfillment: updated, shipment } = await this.shipping.requestCourier(user.id, fulfillment.id);
    return { fulfillment: toFulfillmentDto(updated), shipment: toShipmentDto(shipment) };
  }

  @Post(":orderId/fulfillment/cancel")
  async cancelFulfillment(@CurrentUser() user: SessionUser, @Param("orderId") orderId: string) {
    const fulfillment = await this.shipping.getFulfillmentForOrder(user.id, orderId);
    if (!fulfillment) return null;
    return toFulfillmentDto(await this.shipping.cancelFulfillment(user.id, fulfillment.id));
  }

  @Post(":orderId/shipment/reconcile")
  async reconcileShipment(@CurrentUser() user: SessionUser, @Param("orderId") orderId: string) {
    const shipment = await this.shipping.getShipmentForOrder(user.id, orderId);
    if (!shipment) return null;
    return this.reconciliation.reconcileShipment(shipment.id);
  }
}
