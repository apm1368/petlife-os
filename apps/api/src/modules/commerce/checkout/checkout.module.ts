import { Module } from "@nestjs/common";
import { HouseholdsModule } from "../../households/households.module";
import { CartModule } from "../cart/cart.module";
import { PaymentsModule } from "../payments/payments.module";
import { FinancingModule } from "../financing/financing.module";
import { LedgerModule } from "../ledger/ledger.module";
import { RefundsModule } from "../refunds/refunds.module";
import { OrdersModule } from "../orders/orders.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { CheckoutController } from "./checkout.controller";
import { CheckoutService } from "./checkout.service";
import { InventoryReservationService } from "./inventory-reservation.service";
import { PaymentEventsListener } from "./payment-events.listener";
import { FinancingEventsListener } from "./financing-events.listener";
import { PaymentWebhooksController } from "./payment-webhooks.controller";

@Module({
  imports: [HouseholdsModule, CartModule, PaymentsModule, FinancingModule, LedgerModule, RefundsModule, OrdersModule, LogisticsModule],
  controllers: [CheckoutController, PaymentWebhooksController],
  providers: [CheckoutService, InventoryReservationService, PaymentEventsListener, FinancingEventsListener],
  exports: [CheckoutService],
})
export class CheckoutModule {}
