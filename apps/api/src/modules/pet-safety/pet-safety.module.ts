import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { MyCareHandoffsController, PetSafetyController, PublicPetCardController } from "./pet-safety.controller";
import { PetSafetyService } from "./pet-safety.service";

/** Pet safety: completeness, emergency info, share cards (emergency / QR ID) and care handoffs. */
@Module({
  imports: [PetAccessModule, NotificationsModule],
  controllers: [PetSafetyController, MyCareHandoffsController, PublicPetCardController],
  providers: [PetSafetyService],
  exports: [PetSafetyService],
})
export class PetSafetyModule {}
