import { Module } from "@nestjs/common";
import { PaymentsModule } from "../commerce/payments/payments.module";
import { LedgerModule } from "../commerce/ledger/ledger.module";
import { SubscriptionPlanReadService } from "./subscription-plan-read.service";
import { UsageService } from "./usage.service";
import { EntitlementService } from "./entitlement.service";
import { SubscriptionService } from "./subscription.service";
import { SubscriptionBillingService } from "./subscription-billing.service";
import { SubscriptionRenewalWorkerService } from "./subscription-renewal-worker.service";
import { SubscriptionController } from "./subscription.controller";

/**
 * Reuses PaymentsModule/LedgerModule directly (spec: "reuse the H07 payment
 * stack entirely, do not build a second payment stack") rather than a new
 * gateway/ledger implementation. Exports the read/entitlement services so
 * other domain modules (e.g. PetsModule) can enforce limits without
 * importing the whole billing surface.
 */
@Module({
  imports: [PaymentsModule, LedgerModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionPlanReadService, UsageService, EntitlementService, SubscriptionService, SubscriptionBillingService, SubscriptionRenewalWorkerService],
  exports: [SubscriptionPlanReadService, UsageService, EntitlementService, SubscriptionService, SubscriptionBillingService],
})
export class SubscriptionsModule {}
