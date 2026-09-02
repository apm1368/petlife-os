import { Module } from "@nestjs/common";
import { InventoryMovementService } from "./inventory-movement.service";

@Module({
  providers: [InventoryMovementService],
  exports: [InventoryMovementService],
})
export class InventoryModule {}
