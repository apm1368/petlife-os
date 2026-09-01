import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { ProvidersModule } from "../providers/providers.module";
import { CareCalendarModule } from "../care-calendar/care-calendar.module";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { BookingHoldService } from "./booking-hold.service";
import { BookingHealthAccessService } from "./booking-health-access.service";

@Module({
  imports: [PetAccessModule, ProvidersModule, CareCalendarModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingHoldService, BookingHealthAccessService],
})
export class BookingModule {}
