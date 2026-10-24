import { Module } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { DevPaymentGateway } from "./dev-payment-gateway.service";
import { StandardGatewayAdapter } from "./standard-gateway.adapter";
import { PaymentGatewayRegistry } from "./payment-gateway-registry.service";
import { ProviderEventsService } from "./provider-events.service";
import { PaymentEnvironmentController } from "./payment-environment.controller";

/** Webhook/callback routes live in CheckoutModule's PaymentWebhooksController (both PaymentsService and FinancingService are needed there). The only route here is the read-only payment environment (Batch 6). */
@Module({
  controllers: [PaymentEnvironmentController],
  providers: [PaymentsService, DevPaymentGateway, StandardGatewayAdapter, PaymentGatewayRegistry, ProviderEventsService],
  exports: [PaymentsService, PaymentGatewayRegistry, ProviderEventsService],
})
export class PaymentsModule {}
