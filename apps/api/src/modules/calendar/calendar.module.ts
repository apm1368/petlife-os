import { Global, Module } from "@nestjs/common";
import { CalendarController } from "./calendar.controller";
import { HolidayCalendarService } from "./holiday-calendar.service";

/** Global so working-hours targets, bookings and delivery estimates can all read the same business calendar. */
@Global()
@Module({
  controllers: [CalendarController],
  providers: [HolidayCalendarService],
  exports: [HolidayCalendarService],
})
export class CalendarModule {}
