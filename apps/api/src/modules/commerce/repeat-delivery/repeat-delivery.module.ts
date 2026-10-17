import { Module } from "@nestjs/common";
import { CartModule } from "../cart/cart.module";
import { PromotionsModule } from "../promotions/promotions.module";
import { RepeatDeliveryController } from "./repeat-delivery.controller";
import { RepeatDeliveryService } from "./repeat-delivery.service";
import { RepeatDeliveryWorker } from "./repeat-delivery.worker";

@Module({
  imports: [CartModule, PromotionsModule],
  controllers: [RepeatDeliveryController],
  providers: [RepeatDeliveryService, RepeatDeliveryWorker],
  exports: [RepeatDeliveryService, RepeatDeliveryWorker],
})
export class RepeatDeliveryModule {}
