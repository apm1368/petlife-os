import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { FinancingModule } from "../financing/financing.module";
import { ReconciliationService } from "./reconciliation.service";
import { ReconciliationController } from "./reconciliation.controller";

@Module({
  imports: [PaymentsModule, FinancingModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
