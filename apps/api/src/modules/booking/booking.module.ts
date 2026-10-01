import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { ProvidersModule } from "../providers/providers.module";
import { CareCalendarModule } from "../care-calendar/care-calendar.module";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { BookingHoldService } from "./booking-hold.service";
import { BookingPetAccessService } from "./booking-pet-access.service";
import { BookingLifecycleService } from "./booking-lifecycle.service";
import { BookingExpiryWorker } from "./booking-expiry.worker";
import { WaitlistService } from "./waitlist.service";
import { ProviderReviewsService } from "./provider-reviews.service";
import { BookingEngagementController, PublicProviderReviewsController } from "./engagement.controller";
import { ServicesModule } from "../services/services.module";
import { PaymentsModule } from "../commerce/payments/payments.module";
import { LedgerModule } from "../commerce/ledger/ledger.module";

@Module({
  imports: [PetAccessModule, ProvidersModule, CareCalendarModule, ServicesModule, PaymentsModule, LedgerModule],
  controllers: [BookingsController, BookingEngagementController, PublicProviderReviewsController],
  providers: [BookingsService, BookingHoldService, BookingPetAccessService, BookingLifecycleService, BookingExpiryWorker, WaitlistService, ProviderReviewsService],
  exports: [BookingPetAccessService, BookingLifecycleService, BookingHoldService, WaitlistService, ProviderReviewsService],
})
export class BookingModule {}
