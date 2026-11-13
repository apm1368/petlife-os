import { Module } from "@nestjs/common";
import { LedgerModule } from "../ledger/ledger.module";
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
import { WalletTopUpService } from "./wallet-top-up.service";
import { WalletController } from "./wallet.controller";
import { BusinessWalletService } from "./business-wallet.service";
import { StorageModule } from "../../storage/storage.module";
import { CardTransferDestinationService } from "./card-transfer-destination.service";

/** Webhook/callback routes live in CheckoutModule's PaymentWebhooksController (both PaymentsService and FinancingService are needed there). The only route here is the read-only payment environment (Batch 6). */
@Module({
  imports: [LedgerModule, StorageModule],
  controllers: [PaymentEnvironmentController, PaymentInfrastructureController, WalletController],
  providers: [PaymentsService, DevPaymentGateway, StandardGatewayAdapter, ZibalGateway, PaymentGatewayRegistry, ProviderEventsService, WalletService, CardTransferPaymentService, ZibalPaymentService, ProviderSettlementService, WalletPaymentService, WalletTopUpService, CardTransferDestinationService, BusinessWalletService],
  exports: [PaymentsService, PaymentGatewayRegistry, ProviderEventsService, WalletService, CardTransferPaymentService, ZibalPaymentService, ProviderSettlementService, WalletPaymentService, WalletTopUpService, CardTransferDestinationService, BusinessWalletService],
})
export class PaymentsModule {}
