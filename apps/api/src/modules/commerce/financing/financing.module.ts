import { Module } from "@nestjs/common";
import { FinancingService } from "./financing.service";
import { SnappPayAdapter } from "./snapp-pay.adapter";
import { DigiPayAdapter } from "./digi-pay.adapter";
import { FinancingProviderRegistry } from "./financing-provider-registry.service";

@Module({
  providers: [FinancingService, SnappPayAdapter, DigiPayAdapter, FinancingProviderRegistry],
  exports: [FinancingService, FinancingProviderRegistry],
})
export class FinancingModule {}
