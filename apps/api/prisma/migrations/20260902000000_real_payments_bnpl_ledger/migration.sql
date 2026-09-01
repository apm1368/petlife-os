-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('ONLINE_PAYMENT', 'INSTALLMENTS');

-- CreateEnum
CREATE TYPE "FinancingIntentStatus" AS ENUM ('CREATED', 'ELIGIBILITY_PENDING', 'ELIGIBLE', 'NOT_ELIGIBLE', 'PLAN_SELECTED', 'AUTHORIZATION_PENDING', 'APPROVED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProviderEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED_DUPLICATE');

-- CreateEnum
CREATE TYPE "LedgerAccountCode" AS ENUM ('CASH_GATEWAY_RECEIVABLE', 'CUSTOMER_PAYMENT_CLEARING', 'SELLER_PAYABLE', 'REFUND_PAYABLE', 'PLATFORM_REVENUE');

-- CreateEnum
CREATE TYPE "LedgerEntryDirection" AS ENUM ('DEBIT', 'CREDIT');

-- AlterEnum
ALTER TYPE "CheckoutStatus" ADD VALUE 'PAYMENT_SUCCEEDED_ORDER_ISSUE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentProvider" ADD VALUE 'STANDARD_GATEWAY';
ALTER TYPE "PaymentProvider" ADD VALUE 'SNAPP_PAY';
ALTER TYPE "PaymentProvider" ADD VALUE 'DIGI_PAY';

-- AlterTable
ALTER TABLE "checkouts" ADD COLUMN     "paymentMethodType" "PaymentMethodType";

-- CreateTable
CREATE TABLE "financing_intents" (
    "id" UUID NOT NULL,
    "checkoutId" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "status" "FinancingIntentStatus" NOT NULL DEFAULT 'CREATED',
    "selectedPlanId" UUID,
    "providerReference" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financing_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financing_plan_snapshots" (
    "id" UUID NOT NULL,
    "financingIntentId" UUID NOT NULL,
    "providerPlanId" TEXT NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "downPaymentAmount" INTEGER,
    "installmentAmount" INTEGER,
    "feeAmount" INTEGER,
    "totalPayableAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "firstDueAt" TIMESTAMP(3),
    "scheduleJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financing_plan_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "paymentIntentId" UUID,
    "financingIntentId" UUID,
    "orderId" UUID,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "providerReference" TEXT,
    "requestedByUserId" UUID,
    "requestedByAdminUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_provider_events" (
    "id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "paymentIntentId" UUID,
    "financingIntentId" UUID,
    "status" "ProviderEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "payloadHash" TEXT,

    CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_logs" (
    "id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" UUID NOT NULL,
    "localStatus" TEXT NOT NULL,
    "remoteStatus" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL,
    "code" "LedgerAccountCode" NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "ledgerTransactionId" UUID NOT NULL,
    "ledgerAccountId" UUID NOT NULL,
    "direction" "LedgerEntryDirection" NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financing_intents_selectedPlanId_key" ON "financing_intents"("selectedPlanId");

-- CreateIndex
CREATE INDEX "financing_intents_checkoutId_idx" ON "financing_intents"("checkoutId");

-- CreateIndex
CREATE INDEX "financing_plan_snapshots_financingIntentId_idx" ON "financing_plan_snapshots"("financingIntentId");

-- CreateIndex
CREATE INDEX "refunds_paymentIntentId_idx" ON "refunds"("paymentIntentId");

-- CreateIndex
CREATE INDEX "refunds_financingIntentId_idx" ON "refunds"("financingIntentId");

-- CreateIndex
CREATE INDEX "refunds_orderId_idx" ON "refunds"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_events_provider_providerEventId_key" ON "payment_provider_events"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "reconciliation_logs_referenceType_referenceId_idx" ON "reconciliation_logs"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_code_key" ON "ledger_accounts"("code");

-- CreateIndex
CREATE INDEX "ledger_transactions_referenceType_referenceId_idx" ON "ledger_transactions"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "ledger_entries_ledgerTransactionId_idx" ON "ledger_entries"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "ledger_entries_ledgerAccountId_idx" ON "ledger_entries"("ledgerAccountId");

-- AddForeignKey
ALTER TABLE "financing_intents" ADD CONSTRAINT "financing_intents_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "checkouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_intents" ADD CONSTRAINT "financing_intents_selectedPlanId_fkey" FOREIGN KEY ("selectedPlanId") REFERENCES "financing_plan_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_plan_snapshots" ADD CONSTRAINT "financing_plan_snapshots_financingIntentId_fkey" FOREIGN KEY ("financingIntentId") REFERENCES "financing_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_financingIntentId_fkey" FOREIGN KEY ("financingIntentId") REFERENCES "financing_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_financingIntentId_fkey" FOREIGN KEY ("financingIntentId") REFERENCES "financing_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-appended (Handoff 07): raw-SQL CHECK constraints Prisma's DSL cannot
-- express, following the same precedent as schema_hardening's users
-- contact-info CHECK and commerce_core's inventory CHECKs. Multi-row
-- invariants (e.g. "a LedgerTransaction's debits equal its credits") are not
-- expressible as a single-row CHECK at all and are enforced in
-- LedgerService.recordBalanced instead (see README "Ledger rules").
ALTER TABLE "financing_plan_snapshots" ADD CONSTRAINT "financing_plan_snapshots_installmentCount_positive" CHECK ("installmentCount" > 0);
ALTER TABLE "financing_plan_snapshots" ADD CONSTRAINT "financing_plan_snapshots_totalPayableAmount_positive" CHECK ("totalPayableAmount" > 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_positive" CHECK ("amount" > 0);
