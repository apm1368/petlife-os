import { forwardRef, Module } from "@nestjs/common";
import { CheckoutModule } from "../checkout/checkout.module";
import { PaymentsService } from "./payments.service";
import { DevPaymentGateway } from "./dev-payment-gateway.service";
import { StandardGatewayAdapter } from "./standard-gateway.adapter";
import { PaymentGatewayRegistry } from "./payment-gateway-registry.service";
import { ProviderEventsService } from "./provider-events.service";
import { PaymentEnvironmentController } from "./payment-environment.controller";
import { ZibalGateway } from "./zibal.gateway";
import { WalletService } from "./wallet.service";
import { CardTransferPaymentService } from "./card-transfer-payment.service";
import { ZibalPaymentService } from "./zibal-payment.service";
import { PaymentInfrastructureController } from "./payment-infrastructure.controller";
import { ProviderSettlementService } from "./provider-settlement.service";
import { WalletPaymentService } from "./wallet-payment.service";

/** Webhook/callback routes live in CheckoutModule's PaymentWebhooksController (both PaymentsService and FinancingService are needed there). The only route here is the read-only payment environment (Batch 6). */
@Module({
  imports: [forwardRef(() => CheckoutModule)],
  controllers: [PaymentEnvironmentController, PaymentInfrastructureController],
  providers: [PaymentsService, DevPaymentGateway, StandardGatewayAdapter, ZibalGateway, PaymentGatewayRegistry, ProviderEventsService, WalletService, CardTransferPaymentService, ZibalPaymentService, ProviderSettlementService, WalletPaymentService],
  exports: [PaymentsService, PaymentGatewayRegistry, ProviderEventsService, WalletService, CardTransferPaymentService, ZibalPaymentService, ProviderSettlementService, WalletPaymentService],
})
export class PaymentsModule {}
