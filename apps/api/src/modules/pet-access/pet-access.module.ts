import { Module } from "@nestjs/common";
import { PetAccessController } from "./pet-access.controller";
import { PetAccessService } from "./pet-access.service";

@Module({
  controllers: [PetAccessController],
  providers: [PetAccessService],
  exports: [PetAccessService],
})
export class PetAccessModule {}
