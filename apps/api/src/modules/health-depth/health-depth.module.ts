import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ClinicalHealthModule } from "../clinical-health/clinical-health.module";
import { CareReminderModule } from "../care-reminders/care-reminder.module";
import { ProviderOsModule } from "../provider-os/provider-os.module";
import { HealthDepthController, ProviderCareSuggestionController, PublicHealthShareController } from "./health-depth.controller";
import { HealthDepthService } from "./health-depth.service";
import { HealthShareService } from "./health-share.service";
import { CareSuggestionService } from "./care-suggestion.service";

/** G12: health snapshot/feed, owner health shares, clinic care suggestions (chain #1/#2). */
@Module({
  imports: [PetAccessModule, NotificationsModule, ClinicalHealthModule, CareReminderModule, ProviderOsModule],
  controllers: [HealthDepthController, PublicHealthShareController, ProviderCareSuggestionController],
  providers: [HealthDepthService, HealthShareService, CareSuggestionService],
  exports: [CareSuggestionService],
})
export class HealthDepthModule {}
