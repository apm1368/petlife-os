import { Module } from "@nestjs/common";
import { PaymentsModule } from "../commerce/payments/payments.module";
import { LedgerModule } from "../commerce/ledger/ledger.module";
import { RefundsModule } from "../commerce/refunds/refunds.module";
import { StorageModule } from "../storage/storage.module";
import { ProviderOsModule } from "../provider-os/provider-os.module";
import { TravelModule } from "../travel/travel.module";
import { TravelAvailabilityService } from "./travel-availability.service";
import { TravelBookingService } from "./travel-booking.service";
import { TravelListingService } from "./travel-listing.service";
import { TravelSearchService } from "./travel-search.service";
import { TravelTripHubService } from "./travel-trip-hub.service";
import { TravelExpiryWorker } from "./travel-expiry.worker";
import { TravelNotificationListener } from "./travel-notification.listener";
import { NotificationsModule } from "../notifications/notifications.module";
import { TravelPublicController } from "./travel-public.controller";
import { TravelTravelerController } from "./travel-traveler.controller";
import { TravelProviderController } from "./travel-provider.controller";

/**
 * Batch 5 — registers the travel marketplace (previously orphaned services)
 * with its public, traveller and partner surfaces.
 */
@Module({
  imports: [NotificationsModule, PaymentsModule, LedgerModule, RefundsModule, StorageModule, ProviderOsModule, TravelModule],
  controllers: [TravelPublicController, TravelTravelerController, TravelProviderController],
  providers: [TravelAvailabilityService, TravelBookingService, TravelListingService, TravelSearchService, TravelTripHubService, TravelExpiryWorker, TravelNotificationListener],
  exports: [TravelAvailabilityService, TravelBookingService, TravelListingService, TravelSearchService],
})
export class TravelMarketplaceModule {}
