-- CreateEnum
CREATE TYPE "OrderOrigin" AS ENUM ('PET_LIFE', 'DEV_MARKETPLACE', 'TOROB', 'DIGIKALA');

-- CreateEnum
CREATE TYPE "FinancialConfidence" AS ENUM ('KNOWN', 'ESTIMATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SellerFinancialAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SellerSettlementScheduleType" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'MANUAL');

-- CreateEnum
CREATE TYPE "SellerSettlementStatus" AS ENUM ('CALCULATED', 'APPROVED', 'PAID', 'FAILED', 'RECONCILIATION_REQUIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SellerAdjustmentType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "SellerAdjustmentReasonCode" AS ENUM ('SHIPPING_COMPENSATION', 'MANUAL_CREDIT', 'MANUAL_DEBIT', 'MARKETPLACE_PENALTY', 'CORRECTION');

-- CreateEnum
CREATE TYPE "SellerLedgerAccountCode" AS ENUM ('RECEIVABLE', 'SALES_INCOME', 'SETTLEMENT_PAID', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "MarketplaceSettlementImportSource" AS ENUM ('MANUAL', 'CSV_IMPORT', 'API');

-- CreateEnum
CREATE TYPE "MarketplaceReconciliationStatus" AS ENUM ('MATCHED', 'MISMATCH', 'MISSING_EXTERNAL', 'MISSING_INTERNAL', 'DUPLICATE', 'REVIEW_REQUIRED');

-- AlterEnum
ALTER TYPE "LedgerAccountCode" ADD VALUE 'MARKETPLACE_RECEIVABLE';

-- CreateTable
CREATE TABLE "seller_financial_accounts" (
    "id" UUID NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "status" "SellerFinancialAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "settlementSchedule" "SellerSettlementScheduleType" NOT NULL DEFAULT 'MANUAL',
    "payoutMethodType" TEXT NOT NULL DEFAULT 'MANUAL',
    "payoutReferenceMasked" TEXT,
    "minimumPayoutIrr" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" UUID NOT NULL,
    "sellerOrganizationId" UUID,
    "channel" "OrderOrigin",
    "basisPoints" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_financial_breakdowns" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "origin" "OrderOrigin" NOT NULL,
    "grossMerchandiseIrr" INTEGER NOT NULL,
    "shippingIrr" INTEGER NOT NULL,
    "discountIrr" INTEGER NOT NULL,
    "shippingResponsibility" "DeliveryResponsibility" NOT NULL,
    "commissionRuleId" UUID,
    "commissionBasisPoints" INTEGER NOT NULL,
    "platformCommissionIrr" INTEGER NOT NULL,
    "channelFeeIrr" INTEGER NOT NULL DEFAULT 0,
    "channelFeeConfidence" "FinancialConfidence" NOT NULL DEFAULT 'KNOWN',
    "sellerGrossIrr" INTEGER NOT NULL,
    "sellerNetIrr" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_financial_breakdowns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_ledger_accounts" (
    "id" UUID NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "code" "SellerLedgerAccountCode" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_ledger_transactions" (
    "id" UUID NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "sellerSettlementId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_ledger_entries" (
    "id" UUID NOT NULL,
    "sellerLedgerTransactionId" UUID NOT NULL,
    "sellerLedgerAccountId" UUID NOT NULL,
    "direction" "LedgerEntryDirection" NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_settlements" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "status" "SellerSettlementStatus" NOT NULL DEFAULT 'CALCULATED',
    "grossIrr" INTEGER NOT NULL,
    "commissionIrr" INTEGER NOT NULL,
    "refundsIrr" INTEGER NOT NULL,
    "adjustmentsIrr" INTEGER NOT NULL,
    "netIrr" INTEGER NOT NULL,
    "initiatedByAdminId" UUID NOT NULL,
    "approvedByAdminId" UUID,
    "payoutMethodType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "seller_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_settlement_items" (
    "id" UUID NOT NULL,
    "sellerSettlementId" UUID NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "grossAmount" INTEGER NOT NULL,
    "feeAmount" INTEGER NOT NULL,
    "netAmount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_settlement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_adjustments" (
    "id" UUID NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "type" "SellerAdjustmentType" NOT NULL,
    "reasonCode" "SellerAdjustmentReasonCode" NOT NULL,
    "amountIrr" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceReference" TEXT,
    "createdByAdminId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_settlement_statements" (
    "id" UUID NOT NULL,
    "provider" "MarketplaceProvider" NOT NULL,
    "marketplaceChannelAccountId" UUID NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "source" "MarketplaceSettlementImportSource" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "totalAmount" INTEGER NOT NULL,
    "importedByAdminId" UUID NOT NULL,
    "rawReference" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_settlement_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_settlement_statement_lines" (
    "id" UUID NOT NULL,
    "marketplaceSettlementStatementId" UUID NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "feeAmount" INTEGER,
    "feeConfidence" "FinancialConfidence" NOT NULL DEFAULT 'UNKNOWN',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_settlement_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_reconciliation_results" (
    "id" UUID NOT NULL,
    "marketplaceSettlementStatementId" UUID,
    "marketplaceSettlementStatementLineId" UUID,
    "marketplaceOrderId" UUID,
    "status" "MarketplaceReconciliationStatus" NOT NULL,
    "expectedAmount" INTEGER,
    "statementAmount" INTEGER,
    "variance" INTEGER,
    "notes" TEXT,
    "resolvedByAdminId" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_reconciliation_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seller_financial_accounts_sellerOrganizationId_key" ON "seller_financial_accounts"("sellerOrganizationId");

-- CreateIndex
CREATE INDEX "commission_rules_sellerOrganizationId_channel_idx" ON "commission_rules"("sellerOrganizationId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "order_financial_breakdowns_orderId_key" ON "order_financial_breakdowns"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "seller_ledger_accounts_sellerOrganizationId_code_key" ON "seller_ledger_accounts"("sellerOrganizationId", "code");

-- CreateIndex
CREATE INDEX "seller_ledger_transactions_sellerOrganizationId_sellerSettl_idx" ON "seller_ledger_transactions"("sellerOrganizationId", "sellerSettlementId");

-- CreateIndex
CREATE INDEX "seller_ledger_transactions_referenceType_referenceId_idx" ON "seller_ledger_transactions"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "seller_ledger_entries_sellerLedgerTransactionId_idx" ON "seller_ledger_entries"("sellerLedgerTransactionId");

-- CreateIndex
CREATE INDEX "seller_ledger_entries_sellerLedgerAccountId_idx" ON "seller_ledger_entries"("sellerLedgerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "seller_settlements_reference_key" ON "seller_settlements"("reference");

-- CreateIndex
CREATE INDEX "seller_settlements_sellerOrganizationId_status_idx" ON "seller_settlements"("sellerOrganizationId", "status");

-- CreateIndex
CREATE INDEX "seller_settlement_items_sellerSettlementId_idx" ON "seller_settlement_items"("sellerSettlementId");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_settlement_statements_marketplaceChannelAccount_key" ON "marketplace_settlement_statements"("marketplaceChannelAccountId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_settlement_statement_lines_marketplaceSettlemen_key" ON "marketplace_settlement_statement_lines"("marketplaceSettlementStatementId", "externalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_reconciliation_results_marketplaceSettlementSta_key" ON "marketplace_reconciliation_results"("marketplaceSettlementStatementLineId");

-- CreateIndex
CREATE INDEX "marketplace_reconciliation_results_status_idx" ON "marketplace_reconciliation_results"("status");

-- AddForeignKey
ALTER TABLE "seller_financial_accounts" ADD CONSTRAINT "seller_financial_accounts_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_financial_breakdowns" ADD CONSTRAINT "order_financial_breakdowns_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_financial_breakdowns" ADD CONSTRAINT "order_financial_breakdowns_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_financial_breakdowns" ADD CONSTRAINT "order_financial_breakdowns_commissionRuleId_fkey" FOREIGN KEY ("commissionRuleId") REFERENCES "commission_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_ledger_accounts" ADD CONSTRAINT "seller_ledger_accounts_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_ledger_transactions" ADD CONSTRAINT "seller_ledger_transactions_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_ledger_transactions" ADD CONSTRAINT "seller_ledger_transactions_sellerSettlementId_fkey" FOREIGN KEY ("sellerSettlementId") REFERENCES "seller_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_ledger_entries" ADD CONSTRAINT "seller_ledger_entries_sellerLedgerTransactionId_fkey" FOREIGN KEY ("sellerLedgerTransactionId") REFERENCES "seller_ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_ledger_entries" ADD CONSTRAINT "seller_ledger_entries_sellerLedgerAccountId_fkey" FOREIGN KEY ("sellerLedgerAccountId") REFERENCES "seller_ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_settlements" ADD CONSTRAINT "seller_settlements_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_settlements" ADD CONSTRAINT "seller_settlements_initiatedByAdminId_fkey" FOREIGN KEY ("initiatedByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_settlements" ADD CONSTRAINT "seller_settlements_approvedByAdminId_fkey" FOREIGN KEY ("approvedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_settlement_items" ADD CONSTRAINT "seller_settlement_items_sellerSettlementId_fkey" FOREIGN KEY ("sellerSettlementId") REFERENCES "seller_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_adjustments" ADD CONSTRAINT "seller_adjustments_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_adjustments" ADD CONSTRAINT "seller_adjustments_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_settlement_statements" ADD CONSTRAINT "marketplace_settlement_statements_marketplaceChannelAccoun_fkey" FOREIGN KEY ("marketplaceChannelAccountId") REFERENCES "marketplace_channel_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_settlement_statements" ADD CONSTRAINT "marketplace_settlement_statements_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_settlement_statements" ADD CONSTRAINT "marketplace_settlement_statements_importedByAdminId_fkey" FOREIGN KEY ("importedByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_settlement_statement_lines" ADD CONSTRAINT "marketplace_settlement_statement_lines_marketplaceSettleme_fkey" FOREIGN KEY ("marketplaceSettlementStatementId") REFERENCES "marketplace_settlement_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_reconciliation_results" ADD CONSTRAINT "reconciliation_result_statement_fkey" FOREIGN KEY ("marketplaceSettlementStatementId") REFERENCES "marketplace_settlement_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_reconciliation_results" ADD CONSTRAINT "reconciliation_result_statement_line_fkey" FOREIGN KEY ("marketplaceSettlementStatementLineId") REFERENCES "marketplace_settlement_statement_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_reconciliation_results" ADD CONSTRAINT "marketplace_reconciliation_results_marketplaceOrderId_fkey" FOREIGN KEY ("marketplaceOrderId") REFERENCES "marketplace_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_reconciliation_results" ADD CONSTRAINT "marketplace_reconciliation_results_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Human-readable settlement reference sequence, mirroring support_case_number_seq.
CREATE SEQUENCE IF NOT EXISTS "seller_settlement_reference_seq" START 1;

-- Two-person control (spec: "creator/initiator should not approve their own payout"),
-- mirroring admin_refund_approvals_approver_not_requester exactly. Application-layer
-- check lives in SellerSettlementService.approve(); this is the database-level backstop.
ALTER TABLE "seller_settlements" ADD CONSTRAINT "seller_settlements_approver_not_initiator" CHECK ("approvedByAdminId" IS NULL OR "approvedByAdminId" != "initiatedByAdminId");
