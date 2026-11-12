-- Member wallet: top-up requests (Zibal / card to card with receipt review) and audited staff adjustments.
-- Balances stay derived from wallet_entries; these tables only record why money moved.

-- CreateEnum
CREATE TYPE "WalletTopUpRail" AS ENUM ('ZIBAL', 'CARD_TO_CARD');

-- CreateEnum
CREATE TYPE "WalletTopUpStatus" AS ENUM ('AWAITING_PAYMENT', 'AWAITING_RECEIPT', 'REVIEW_PENDING', 'CREDITED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WalletAdjustmentDirection" AS ENUM ('CREDIT', 'DEBIT');

-- AlterEnum
ALTER TYPE "LedgerAccountCode" ADD VALUE 'WALLET_ADJUSTMENT';

-- CreateTable
CREATE TABLE "wallet_top_ups" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rail" "WalletTopUpRail" NOT NULL,
    "status" "WalletTopUpStatus" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "idempotencyKey" TEXT NOT NULL,
    "zibalTrackId" TEXT,
    "cardNumberMasked" TEXT,
    "cardHolderName" TEXT,
    "receiptObjectKey" TEXT,
    "receiptUploadedAt" TIMESTAMP(3),
    "receiptDeadlineAt" TIMESTAMP(3),
    "receivedAmount" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" UUID,
    "rejectionReason" TEXT,
    "failureCode" TEXT,
    "walletEntryId" UUID,
    "creditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_top_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_adjustments" (
    "id" UUID NOT NULL,
    "walletAccountId" UUID NOT NULL,
    "direction" "WalletAdjustmentDirection" NOT NULL,
    "balanceType" "WalletBalanceType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceReference" TEXT,
    "idempotencyKey" TEXT,
    "walletEntryId" UUID NOT NULL,
    "createdByAdminId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_top_ups_idempotencyKey_key" ON "wallet_top_ups"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_top_ups_zibalTrackId_key" ON "wallet_top_ups"("zibalTrackId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_top_ups_walletEntryId_key" ON "wallet_top_ups"("walletEntryId");

-- CreateIndex
CREATE INDEX "wallet_top_ups_userId_createdAt_idx" ON "wallet_top_ups"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_top_ups_status_createdAt_idx" ON "wallet_top_ups"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_adjustments_idempotencyKey_key" ON "wallet_adjustments"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_adjustments_walletEntryId_key" ON "wallet_adjustments"("walletEntryId");

-- CreateIndex
CREATE INDEX "wallet_adjustments_walletAccountId_createdAt_idx" ON "wallet_adjustments"("walletAccountId", "createdAt");

-- AddForeignKey
ALTER TABLE "wallet_top_ups" ADD CONSTRAINT "wallet_top_ups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_top_ups" ADD CONSTRAINT "wallet_top_ups_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_adjustments" ADD CONSTRAINT "wallet_adjustments_walletAccountId_fkey" FOREIGN KEY ("walletAccountId") REFERENCES "wallet_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_adjustments" ADD CONSTRAINT "wallet_adjustments_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Integrity the application also enforces: positive integer rials, and a credited top-up always names its entry.
ALTER TABLE "wallet_top_ups" ADD CONSTRAINT "wallet_top_ups_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "wallet_top_ups" ADD CONSTRAINT "wallet_top_ups_received_non_negative" CHECK ("receivedAmount" IS NULL OR "receivedAmount" >= 0);
ALTER TABLE "wallet_top_ups" ADD CONSTRAINT "wallet_top_ups_credited_has_entry" CHECK ("status" <> 'CREDITED' OR ("walletEntryId" IS NOT NULL AND "creditedAt" IS NOT NULL));
ALTER TABLE "wallet_adjustments" ADD CONSTRAINT "wallet_adjustments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "wallet_adjustments" ADD CONSTRAINT "wallet_adjustments_reason_present" CHECK (length(btrim("reason")) >= 5);
