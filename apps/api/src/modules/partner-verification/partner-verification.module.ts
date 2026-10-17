import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { StorageModule } from "../storage/storage.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProviderOsModule } from "../provider-os/provider-os.module";
import { SellerOsModule } from "../seller-os/seller-os.module";
import { ProviderAuthGuard } from "../provider-os/auth/provider-auth.guard";
import { AdminPartnerVerificationController, ProviderVerificationController, SellerVerificationController } from "./partner-verification.controllers";
import { PartnerVerificationService } from "./partner-verification.service";
import { PartnerDocumentExpiryWorker } from "./partner-document-expiry.worker";

/** ERP-C: provider + seller verification evidence, review and expiry operations. */
@Module({
  imports: [AdminModule, StorageModule, NotificationsModule, ProviderOsModule, SellerOsModule],
  controllers: [ProviderVerificationController, SellerVerificationController, AdminPartnerVerificationController],
  providers: [PartnerVerificationService, PartnerDocumentExpiryWorker, ProviderAuthGuard],
  exports: [PartnerVerificationService],
})
export class PartnerVerificationModule {}
