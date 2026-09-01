import { Module } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { DevPaymentGateway } from "./dev-payment-gateway.service";
import { StandardGatewayAdapter } from "./standard-gateway.adapter";
import { PaymentGatewayRegistry } from "./payment-gateway-registry.service";
import { ProviderEventsService } from "./provider-events.service";

/** No controller here on purpose — the webhook/callback routes live in CheckoutModule's PaymentWebhooksController, since that's the one place both PaymentsService and FinancingService can be injected together without a module import cycle (see its doc comment). */
@Module({
  providers: [PaymentsService, DevPaymentGateway, StandardGatewayAdapter, PaymentGatewayRegistry, ProviderEventsService],
  exports: [PaymentsService, PaymentGatewayRegistry, ProviderEventsService],
})
export class PaymentsModule {}
