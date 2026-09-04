import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { StorageModule } from "../storage/storage.module";
import { SubscriptionsModule } from "../subscriptions/subscription.module";
import { ActivePetController } from "./active-pet.controller";
import { ActivePetService } from "./active-pet.service";
import { HouseholdPetsController } from "./household-pets.controller";
import { PetLifecycleService } from "./pet-lifecycle.service";
import { PetsController } from "./pets.controller";
import { PetsService } from "./pets.service";

@Module({
  imports: [PetAccessModule, StorageModule, SubscriptionsModule],
  controllers: [HouseholdPetsController, PetsController, ActivePetController],
  providers: [PetsService, ActivePetService, PetLifecycleService],
  exports: [PetsService, ActivePetService, PetLifecycleService],
})
export class PetsModule {}
