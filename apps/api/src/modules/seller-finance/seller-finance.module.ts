import { Module } from "@nestjs/common";
import { LedgerModule } from "../commerce/ledger/ledger.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { CommissionRuleService } from "./commission-rule.service";
import { SellerLedgerService } from "./seller-ledger.service";
import { SellerFinanceService } from "./seller-finance.service";
import { SellerFinancialAccountService } from "./seller-financial-account.service";
import { SellerFinanceReadService } from "./seller-finance-read.service";
import { SellerFinanceNotificationListener } from "./seller-finance-notification.listener";

/**
 * Marketplace & Seller Financial Settlement (Handoff 14) — imports
 * LedgerModule because SellerFinanceService posts to the platform-wide
 * ledger (SELLER_PAYABLE/PLATFORM_REVENUE/MARKETPLACE_RECEIVABLE) in the
 * same breath as it posts to the per-seller subledger. Exported services
 * are consumed by CheckoutModule (direct sales) and MarketplaceModule
 * (marketplace sales) without either depending on the other.
 */
@Module({
  imports: [LedgerModule, NotificationsModule],
  providers: [CommissionRuleService, SellerLedgerService, SellerFinanceService, SellerFinancialAccountService, SellerFinanceReadService, SellerFinanceNotificationListener],
  exports: [CommissionRuleService, SellerLedgerService, SellerFinanceService, SellerFinancialAccountService, SellerFinanceReadService],
})
export class SellerFinanceModule {}
