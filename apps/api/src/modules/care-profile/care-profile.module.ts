import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { CareProfileController } from "./care-profile.controller";
import { CareProfileService } from "./care-profile.service";

@Module({
  imports: [PetAccessModule],
  controllers: [CareProfileController],
  providers: [CareProfileService],
  exports: [CareProfileService],
})
export class CareProfileModule {}
