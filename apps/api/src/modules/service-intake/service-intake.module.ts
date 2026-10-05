import { Module } from "@nestjs/common";
import { ProviderOsModule } from "../provider-os/provider-os.module";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { StorageModule } from "../storage/storage.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OwnerBookingAttachmentsController, ProviderIntakeController, PublicIntakeFormController } from "./service-intake.controller";
import { ServiceIntakeService } from "./service-intake.service";

/** Provider intake forms (versioned) and private booking attachments. */
@Module({
  imports: [ProviderOsModule, PetAccessModule, StorageModule, NotificationsModule],
  controllers: [PublicIntakeFormController, OwnerBookingAttachmentsController, ProviderIntakeController],
  providers: [ServiceIntakeService],
  exports: [ServiceIntakeService],
})
export class ServiceIntakeModule {}
