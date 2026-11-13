-- FE-16: a member wallet correction needs a reason and a second admin's approval. One admin requests it (no money
-- moves); a different admin with wallet.adjust approves it, and only then are the wallet_adjustments row, its
-- wallet_entries row and the ledger transaction written. Pending requests lapse after a fixed window.

-- CreateEnum
CREATE TYPE "WalletAdjustmentRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "wallet_adjustment_requests" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "direction" "WalletAdjustmentDirection" NOT NULL,
    "balanceType" "WalletBalanceType" NOT NULL,
    "amountIrr" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "evidenceReference" TEXT,
    "status" "WalletAdjustmentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT,
    "requestedByAdminId" UUID NOT NULL,
    "decidedByAdminId" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "walletAdjustmentId" UUID,
    "walletEntryId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_adjustment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_adjustment_requests_idempotencyKey_key" ON "wallet_adjustment_requests"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_adjustment_requests_walletAdjustmentId_key" ON "wallet_adjustment_requests"("walletAdjustmentId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_adjustment_requests_walletEntryId_key" ON "wallet_adjustment_requests"("walletEntryId");

-- CreateIndex
CREATE INDEX "wallet_adjustment_requests_status_expiresAt_idx" ON "wallet_adjustment_requests"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "wallet_adjustment_requests_userId_status_idx" ON "wallet_adjustment_requests"("userId", "status");

-- AddForeignKey
ALTER TABLE "wallet_adjustment_requests" ADD CONSTRAINT "wallet_adjustment_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_adjustment_requests" ADD CONSTRAINT "wallet_adjustment_requests_requestedByAdminId_fkey" FOREIGN KEY ("requestedByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_adjustment_requests" ADD CONSTRAINT "wallet_adjustment_requests_decidedByAdminId_fkey" FOREIGN KEY ("decidedByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_adjustment_requests" ADD CONSTRAINT "wallet_adjustment_requests_walletAdjustmentId_fkey" FOREIGN KEY ("walletAdjustmentId") REFERENCES "wallet_adjustments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity the application also enforces: positive integer rials and a written reason; the approver is never the
-- requester; an approved request names what it posted; a rejection says why.
ALTER TABLE "wallet_adjustment_requests" ADD CONSTRAINT "wallet_adjustment_requests_amount_positive" CHECK ("amountIrr" > 0);
ALTER TABLE "wallet_adjustment_requests" ADD CONSTRAINT "wallet_adjustment_requests_note_present" CHECK (length(btrim("note")) >= 5);
ALTER TABLE "wallet_adjustment_requests" ADD CONSTRAINT "wallet_adjustment_requests_approver_not_requester" CHECK ("status" <> 'APPROVED' OR "decidedByAdminId" <> "requestedByAdminId");
ALTER TABLE "wallet_adjustment_requests" ADD CONSTRAINT "wallet_adjustment_requests_approved_has_posting" CHECK ("status" <> 'APPROVED' OR ("decidedByAdminId" IS NOT NULL AND "decidedAt" IS NOT NULL AND "walletAdjustmentId" IS NOT NULL AND "walletEntryId" IS NOT NULL));
ALTER TABLE "wallet_adjustment_requests" ADD CONSTRAINT "wallet_adjustment_requests_rejected_has_reason" CHECK ("status" <> 'REJECTED' OR ("decidedByAdminId" IS NOT NULL AND "decidedAt" IS NOT NULL AND length(btrim(coalesce("decisionReason", ''))) >= 5));
