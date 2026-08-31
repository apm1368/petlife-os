import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { PetHealthModule } from "../health/health.module";
import { CareProfileModule } from "../care-profile/care-profile.module";
import { HomeController } from "./home.controller";
import { HomeRankingService } from "./home-ranking.service";
import { HomeService } from "./home.service";

@Module({
  imports: [PetAccessModule, PetHealthModule, CareProfileModule],
  controllers: [HomeController],
  providers: [HomeService, HomeRankingService],
})
export class HomeModule {}
