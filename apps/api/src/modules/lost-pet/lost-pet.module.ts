import { Module } from "@nestjs/common";
import { PetSafetyModule } from "../pet-safety/pet-safety.module";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { PetsModule } from "../pets/pets.module";
import { StorageModule } from "../storage/storage.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { CommunityModule } from "../community/community.module";
import { LostPetIncidentService } from "./lost-pet-incident.service";
import { LostPetNotificationListener } from "./lost-pet-notification.listener";
import { LostPetController } from "./lost-pet.controller";
import { PublicLostPetController } from "./public-lost-pet.controller";
import { LostPetAreaAlertController } from "./lost-pet-area-alert.controller";
import { LostPetAreaAlertService } from "./lost-pet-area-alert.service";

@Module({
  imports: [PetAccessModule, StorageModule, PetsModule, NotificationsModule, CommunityModule, PetSafetyModule],
  controllers: [LostPetController, PublicLostPetController, LostPetAreaAlertController],
  providers: [LostPetIncidentService, LostPetNotificationListener, LostPetAreaAlertService],
  exports: [LostPetIncidentService],
})
export class LostPetModule {}
