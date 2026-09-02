import { Module } from "@nestjs/common";
import { DevShippingAdapter } from "./dev-shipping.adapter";
import { AloPeykAdapter } from "./alopeyk.adapter";
import { SnappBoxAdapter } from "./snappbox.adapter";
import { ShippingProviderRegistry } from "./shipping-provider-registry.service";
import { FulfillmentTransitionService } from "./fulfillment-transition.service";
import { ShippingOrchestrator } from "./shipping-orchestrator.service";
import { ShipmentEventsService } from "./shipment-events.service";
import { ShippingReconciliationService } from "./shipping-reconciliation.service";
import { CheckoutShippingController, OrderLogisticsController } from "./shipping.controller";
import { ShippingWebhooksController } from "./shipping-webhooks.controller";

/**
 * Delivery & Logistics Core (Handoff 08) — a self-contained module that
 * never imports CheckoutModule/OrdersModule (avoiding the same kind of
 * import cycle H07's PaymentsModule/FinancingModule sidestepped): every
 * service here reads/writes Checkout/Order rows directly via PrismaService,
 * doing its own ownership checks, exactly like RefundsService does for
 * Order. CheckoutModule imports *this* module (one-directional) to call
 * `ShippingOrchestrator.createFulfillmentsForOrders` at payment
 * confirmation time.
 */
@Module({
  controllers: [CheckoutShippingController, OrderLogisticsController, ShippingWebhooksController],
  providers: [
    DevShippingAdapter,
    AloPeykAdapter,
    SnappBoxAdapter,
    ShippingProviderRegistry,
    FulfillmentTransitionService,
    ShipmentEventsService,
    ShippingOrchestrator,
    ShippingReconciliationService,
  ],
  exports: [ShippingOrchestrator, ShippingReconciliationService, FulfillmentTransitionService, ShipmentEventsService, ShippingProviderRegistry, DevShippingAdapter],
})
export class LogisticsModule {}
