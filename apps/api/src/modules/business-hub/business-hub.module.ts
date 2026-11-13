import { Module } from "@nestjs/common";
import { SellerFinanceModule } from "../seller-finance/seller-finance.module";
import { BusinessHubController } from "./business-hub.controller";
import { BusinessHubService } from "./business-hub.service";

@Module({
  imports: [SellerFinanceModule],
  controllers: [BusinessHubController],
  providers: [BusinessHubService],
})
export class BusinessHubModule {}
