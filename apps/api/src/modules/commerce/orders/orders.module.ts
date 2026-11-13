import { Module } from "@nestjs/common";
import { RefundsModule } from "../refunds/refunds.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { InventoryModule } from "../inventory/inventory.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { OrderLifecycleService } from "./order-lifecycle.service";
import { OrderApprovalService } from "./order-approval.service";
import { SellerFinanceModule } from "../../seller-finance/seller-finance.module";

@Module({
  imports: [RefundsModule, LogisticsModule, InventoryModule, SellerFinanceModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderLifecycleService, OrderApprovalService],
  exports: [OrdersService, OrderLifecycleService, OrderApprovalService],
})
export class OrdersModule {}
