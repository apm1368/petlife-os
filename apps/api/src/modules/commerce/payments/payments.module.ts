import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { DevPaymentGateway } from "./dev-payment-gateway.service";
import { PAYMENT_GATEWAY } from "./payment-gateway.interface";

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, { provide: PAYMENT_GATEWAY, useClass: DevPaymentGateway }],
  exports: [PaymentsService],
})
export class PaymentsModule {}
