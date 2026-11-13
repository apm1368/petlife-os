-- One wallet per account: members keep their own wallet; each seller/provider organisation gets one business wallet.
-- Two-person (FE-16) staff transfers between wallets. Existing wallets are all member wallets (ownerType MEMBER).

-- CreateEnum
CREATE TYPE "WalletOwnerType" AS ENUM ('MEMBER', 'SELLER', 'PROVIDER');

-- AlterEnum
ALTER TYPE "WalletCreditSource" ADD VALUE 'TRANSFER';

-- AlterEnum
ALTER TYPE "LedgerAccountCode" ADD VALUE 'WALLET_TRANSFER_CLEARING';

-- AlterTable
ALTER TABLE "wallet_accounts" ADD COLUMN     "ownerType" "WalletOwnerType" NOT NULL DEFAULT 'MEMBER',
ADD COLUMN     "providerOrganizationId" UUID,
ADD COLUMN     "sellerOrganizationId" UUID,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "wallet_top_ups" ADD COLUMN     "walletAccountId" UUID;

-- CreateTable
CREATE TABLE "wallet_transfer_requests" (
    "id" UUID NOT NULL,
    "fromWalletAccountId" UUID NOT NULL,
    "toWalletAccountId" UUID NOT NULL,
    "balanceType" "WalletBalanceType" NOT NULL,
    "amountIrr" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "related" BOOLEAN NOT NULL,
    "status" "WalletAdjustmentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT,
    "reversesTransferId" UUID,
    "requestedByAdminId" UUID NOT NULL,
    "decidedByAdminId" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "debitEntryId" UUID,
    "creditEntryId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_transfer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transfer_requests_idempotencyKey_key" ON "wallet_transfer_requests"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transfer_requests_debitEntryId_key" ON "wallet_transfer_requests"("debitEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transfer_requests_creditEntryId_key" ON "wallet_transfer_requests"("creditEntryId");

-- CreateIndex
CREATE INDEX "wallet_transfer_requests_status_expiresAt_idx" ON "wallet_transfer_requests"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "wallet_transfer_requests_fromWalletAccountId_createdAt_idx" ON "wallet_transfer_requests"("fromWalletAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_transfer_requests_toWalletAccountId_createdAt_idx" ON "wallet_transfer_requests"("toWalletAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_accounts_sellerOrganizationId_key" ON "wallet_accounts"("sellerOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_accounts_providerOrganizationId_key" ON "wallet_accounts"("providerOrganizationId");

-- CreateIndex
CREATE INDEX "wallet_top_ups_walletAccountId_createdAt_idx" ON "wallet_top_ups"("walletAccountId", "createdAt");

-- AddForeignKey
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_top_ups" ADD CONSTRAINT "wallet_top_ups_walletAccountId_fkey" FOREIGN KEY ("walletAccountId") REFERENCES "wallet_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transfer_requests" ADD CONSTRAINT "wallet_transfer_requests_fromWalletAccountId_fkey" FOREIGN KEY ("fromWalletAccountId") REFERENCES "wallet_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transfer_requests" ADD CONSTRAINT "wallet_transfer_requests_toWalletAccountId_fkey" FOREIGN KEY ("toWalletAccountId") REFERENCES "wallet_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transfer_requests" ADD CONSTRAINT "wallet_transfer_requests_reversesTransferId_fkey" FOREIGN KEY ("reversesTransferId") REFERENCES "wallet_transfer_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transfer_requests" ADD CONSTRAINT "wallet_transfer_requests_requestedByAdminId_fkey" FOREIGN KEY ("requestedByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transfer_requests" ADD CONSTRAINT "wallet_transfer_requests_decidedByAdminId_fkey" FOREIGN KEY ("decidedByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Exactly one owner, matching ownerType (existing rows: MEMBER with userId set).
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_one_owner_check" CHECK (
  ("ownerType" = 'MEMBER' AND "userId" IS NOT NULL AND "sellerOrganizationId" IS NULL AND "providerOrganizationId" IS NULL)
  OR ("ownerType" = 'SELLER' AND "userId" IS NULL AND "sellerOrganizationId" IS NOT NULL AND "providerOrganizationId" IS NULL)
  OR ("ownerType" = 'PROVIDER' AND "userId" IS NULL AND "sellerOrganizationId" IS NULL AND "providerOrganizationId" IS NOT NULL)
);

-- A transfer moves a positive amount between two different wallets, and is never decided by the admin who asked for it.
ALTER TABLE "wallet_transfer_requests" ADD CONSTRAINT "wallet_transfer_requests_amount_check" CHECK ("amountIrr" > 0);
ALTER TABLE "wallet_transfer_requests" ADD CONSTRAINT "wallet_transfer_requests_distinct_wallets_check" CHECK ("fromWalletAccountId" <> "toWalletAccountId");
ALTER TABLE "wallet_transfer_requests" ADD CONSTRAINT "wallet_transfer_requests_second_person_check" CHECK ("decidedByAdminId" IS NULL OR "decidedByAdminId" <> "requestedByAdminId");
ALTER TABLE "wallet_transfer_requests" ADD CONSTRAINT "wallet_transfer_requests_evidence_check" CHECK (length(btrim("evidenceReference")) > 0);

-- At most one live (pending or approved) reversal per transfer.
CREATE UNIQUE INDEX "wallet_transfer_requests_one_live_reversal" ON "wallet_transfer_requests"("reversesTransferId") WHERE "reversesTransferId" IS NOT NULL AND "status" IN ('PENDING', 'APPROVED');
