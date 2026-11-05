import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { PetOwnershipController } from "./pet-ownership.controller";
import { PetOwnershipService } from "./pet-ownership.service";

@Module({
  controllers: [PetOwnershipController],
  imports: [NotificationsModule],
  providers: [PetOwnershipService],
  exports: [PetOwnershipService],
})
export class PetOwnershipModule {}
