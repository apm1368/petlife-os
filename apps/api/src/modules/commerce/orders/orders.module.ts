import { Module } from "@nestjs/common";
import { RefundsModule } from "../refunds/refunds.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { InventoryModule } from "../inventory/inventory.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { OrderLifecycleService } from "./order-lifecycle.service";

@Module({
  imports: [RefundsModule, LogisticsModule, InventoryModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderLifecycleService],
  exports: [OrdersService, OrderLifecycleService],
})
export class OrdersModule {}
