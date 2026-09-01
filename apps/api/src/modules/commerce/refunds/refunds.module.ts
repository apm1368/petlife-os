import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { FinancingModule } from "../financing/financing.module";
import { LedgerModule } from "../ledger/ledger.module";
import { RefundsService } from "./refunds.service";
import { RefundsController } from "./refunds.controller";

@Module({
  imports: [PaymentsModule, FinancingModule, LedgerModule],
  controllers: [RefundsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
