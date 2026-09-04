import { Module } from "@nestjs/common";
import { PaymentsModule } from "../commerce/payments/payments.module";
import { LedgerModule } from "../commerce/ledger/ledger.module";
import { DonationLedgerService } from "./donation-ledger.service";
import { DonationService } from "./donation.service";
import { PublicAnimalSupportReadService } from "./public-animal-support-read.service";
import { PublicAnimalSupportController } from "./public-animal-support.controller";
import { DonationController } from "./donation.controller";

/**
 * The public/consumer half of the Handoff 18 Animal Support domain —
 * read-only organization/rescue-case/campaign directory plus donation
 * payment execution and a donor's own history. The admin-mutating half
 * (AnimalSupportOrganizationService/RescueCaseService/SupportCampaignService/
 * AdminDonationService — create/update/verify/status-transition/refund/
 * payout) lives directly in AdminModule (`admin/animal-support/`) since
 * every one of those mutations needs AdminAuditLogService — the exact
 * layering ContentModule/AdminModule already established for the CMS
 * domain (Handoff 15). The two halves share only the pure mapper functions
 * in animal-support-mapper.ts and the fund-agnostic DonationLedgerService
 * read methods, never an admin-mutating service, so there is no import
 * relationship from AdminModule back into this module.
 *
 * Imports PaymentsModule/LedgerModule directly (spec: "reuse H07 payment
 * primitives... but keep accounting classification separate") — the exact
 * reuse SubscriptionsModule already established for H16 billing.
 */
@Module({
  imports: [PaymentsModule, LedgerModule],
  controllers: [PublicAnimalSupportController, DonationController],
  providers: [PublicAnimalSupportReadService, DonationLedgerService, DonationService],
  exports: [DonationLedgerService],
})
export class AnimalSupportModule {}
