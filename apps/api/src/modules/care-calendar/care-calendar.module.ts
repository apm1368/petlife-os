import { Module } from "@nestjs/common";
import { CareCalendarController } from "./care-calendar.controller";
import { CareCalendarService } from "./care-calendar.service";

@Module({
  controllers: [CareCalendarController],
  providers: [CareCalendarService],
  exports: [CareCalendarService],
})
export class CareCalendarModule {}
