import { Module } from "@nestjs/common";
import { CareCalendarController } from "./care-calendar.controller";
import { CareCalendarService } from "./care-calendar.service";
import { PetAccessModule } from "../pet-access/pet-access.module";

@Module({
  imports: [PetAccessModule],
  controllers: [CareCalendarController],
  providers: [CareCalendarService],
  exports: [CareCalendarService],
})
export class CareCalendarModule {}
