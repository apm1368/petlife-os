import { Module } from "@nestjs/common";
import { PaymentsModule } from "../commerce/payments/payments.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PlatformSettingsModule } from "../platform-settings/platform-settings.module";
import { SponsoredPartnerController, SponsoredPublicController } from "./sponsored.controller";
import { SponsoredRateService } from "./sponsored-rate.service";
import { SponsoredService } from "./sponsored.service";

/** Sponsored listings billed per click (owner #2). Admin management lives in the admin module (AdminSponsoredService). */
@Module({
  imports: [PaymentsModule, NotificationsModule, PlatformSettingsModule],
  controllers: [SponsoredPublicController, SponsoredPartnerController],
  providers: [SponsoredService, SponsoredRateService],
  exports: [SponsoredService, SponsoredRateService],
})
export class SponsoredModule {}
