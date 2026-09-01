import { Module } from "@nestjs/common";
import { HouseholdsModule } from "../../households/households.module";
import { CartModule } from "../cart/cart.module";
import { PaymentsModule } from "../payments/payments.module";
import { OrdersModule } from "../orders/orders.module";
import { CheckoutController } from "./checkout.controller";
import { CheckoutService } from "./checkout.service";
import { InventoryReservationService } from "./inventory-reservation.service";
import { PaymentEventsListener } from "./payment-events.listener";

@Module({
  imports: [HouseholdsModule, CartModule, PaymentsModule, OrdersModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, InventoryReservationService, PaymentEventsListener],
  exports: [CheckoutService],
})
export class CheckoutModule {}
