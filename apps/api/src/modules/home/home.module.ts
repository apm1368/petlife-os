import { Module } from "@nestjs/common";
import { HomeController } from "./home.controller";
import { HomeRankingService } from "./home-ranking.service";
import { HomeService } from "./home.service";

@Module({
  controllers: [HomeController],
  providers: [HomeService, HomeRankingService],
})
export class HomeModule {}
