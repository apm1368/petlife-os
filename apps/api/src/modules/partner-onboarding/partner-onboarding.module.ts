import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { PartnerVerificationModule } from "../partner-verification/partner-verification.module";
import { PartnerOnboardingController } from "./partner-onboarding.controller";
import { PartnerOnboardingService } from "./partner-onboarding.service";
import { PartnerOnboardingVerificationListener } from "./partner-onboarding.listener";

/** Partner signup ("ثبت‌نام همکار"): the wizard that creates a partner's own service business and/or shop and hands it to KYC. */
@Module({
  imports: [StorageModule, PartnerVerificationModule],
  controllers: [PartnerOnboardingController],
  providers: [PartnerOnboardingService, PartnerOnboardingVerificationListener],
  exports: [PartnerOnboardingService],
})
export class PartnerOnboardingModule {}
