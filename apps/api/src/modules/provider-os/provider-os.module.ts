import { Module } from "@nestjs/common";
import { BookingModule } from "../booking/booking.module";
import { CareCalendarModule } from "../care-calendar/care-calendar.module";
import { CareProfileModule } from "../care-profile/care-profile.module";
import { PetHealthModule } from "../health/health.module";
import { ProviderContextController } from "./provider-context.controller";
import { ProviderContextService } from "./provider-context.service";
import { ProviderAuthGuard } from "./auth/provider-auth.guard";
import { ProviderOverviewController } from "./provider-overview.controller";
import { ProviderOverviewService } from "./provider-overview.service";
import { ProviderAvailabilityController } from "./provider-availability.controller";
import { ProviderAvailabilityService } from "./provider-availability.service";
import { ProviderBookingsController } from "./provider-bookings.controller";
import { ProviderBookingsService } from "./provider-bookings.service";
import { ProviderServicesController } from "./provider-services.controller";
import { ProviderServicesService } from "./provider-services.service";
import { ProviderTeamController } from "./provider-team.controller";
import { ProviderTeamService } from "./provider-team.service";

@Module({
  imports: [BookingModule, CareCalendarModule, CareProfileModule, PetHealthModule],
  controllers: [
    ProviderContextController,
    ProviderOverviewController,
    ProviderAvailabilityController,
    ProviderBookingsController,
    ProviderServicesController,
    ProviderTeamController,
  ],
  providers: [
    ProviderContextService,
    ProviderAuthGuard,
    ProviderOverviewService,
    ProviderAvailabilityService,
    ProviderBookingsService,
    ProviderServicesService,
    ProviderTeamService,
  ],
  exports: [ProviderContextService],
})
export class ProviderOsModule {}
