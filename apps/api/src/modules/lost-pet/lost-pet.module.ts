import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { PetsModule } from "../pets/pets.module";
import { StorageModule } from "../storage/storage.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { CommunityModule } from "../community/community.module";
import { LostPetIncidentService } from "./lost-pet-incident.service";
import { LostPetNotificationListener } from "./lost-pet-notification.listener";
import { LostPetController } from "./lost-pet.controller";
import { PublicLostPetController } from "./public-lost-pet.controller";

@Module({
  imports: [PetAccessModule, StorageModule, PetsModule, NotificationsModule, CommunityModule],
  controllers: [LostPetController, PublicLostPetController],
  providers: [LostPetIncidentService, LostPetNotificationListener],
  exports: [LostPetIncidentService],
})
export class LostPetModule {}
