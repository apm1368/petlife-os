import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { SetPetController } from "./set-pet.controller";
import { SetPetService } from "./set-pet.service";

/** «ست پت» member side (requests, private design uploads). Staff work these requests from the admin queue. */
@Module({
  imports: [StorageModule, PetAccessModule],
  controllers: [SetPetController],
  providers: [SetPetService],
  exports: [SetPetService],
})
export class SetPetModule {}
