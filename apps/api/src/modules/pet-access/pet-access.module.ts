import { Module } from "@nestjs/common";
import { PetAccessService } from "./pet-access.service";

@Module({
  providers: [PetAccessService],
  exports: [PetAccessService],
})
export class PetAccessModule {}
