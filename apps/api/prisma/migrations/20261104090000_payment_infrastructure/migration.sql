-- P1-a payment infrastructure.  All monetary columns are integer IRR.

ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'ZIBAL';
CREATE TYPE "PaymentRail" AS ENUM ('ZIBAL', 'CARD_TO_CARD', 'WALLET');
CREATE TYPE "ZibalPaymentStatus" AS ENUM ('INITIATED', 'REDIRECTED', 'VERIFIED', 'FAILED', 'ABANDONED', 'UNKNOWN');
CREATE TYPE "CardTransferPaymentStatus" AS ENUM ('AWAITING_RECEIPT', 'REVIEW_PENDING', 'APPROVED', 'REJECTED', 'UNDERPAID_AWAITING_DIFFERENCE', 'EXPIRED', 'CANCELLED');
CREATE TYPE "WalletBalanceType" AS ENUM ('WITHDRAWABLE', 'PURCHASE_ONLY');
CREATE TYPE "WalletEntryKind" AS ENUM ('CREDIT', 'DEBIT', 'EXPIRY');
CREATE TYPE "WalletCreditSource" AS ENUM ('REFUND', 'TOP_UP', 'GIFT', 'OVERPAYMENT', 'DUPLICATE_PAYMENT', 'MANUAL_CORRECTION');
CREATE TYPE "ProviderSettlementStatus" AS ENUM ('CALCULATED', 'APPROVED', 'PAID', 'FAILED', 'CANCELLED');

ALTER TYPE "LedgerAccountCode" ADD VALUE IF NOT EXISTS 'WALLET_WITHDRAWABLE_LIABILITY';
ALTER TYPE "LedgerAccountCode" ADD VALUE IF NOT EXISTS 'WALLET_PURCHASE_LIABILITY';
ALTER TYPE "LedgerAccountCode" ADD VALUE IF NOT EXISTS 'CARD_TRANSFER_RECEIVABLE';
ALTER TYPE "LedgerAccountCode" ADD VALUE IF NOT EXISTS 'PROVIDER_PAYABLE';
ALTER TYPE "LedgerAccountCode" ADD VALUE IF NOT EXISTS 'CPC_RECEIVABLE';
ALTER TYPE "LedgerAccountCode" ADD VALUE IF NOT EXISTS 'PAWMA_REWARD_LIABILITY';

ALTER TABLE "payment_intents" ADD COLUMN "rail" "PaymentRail";
ALTER TABLE "ledger_transactions" ADD COLUMN "reversesLedgerTransactionId" UUID;
ALTER TABLE "ledger_transactions" ADD COLUMN "correctionReason" TEXT;
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_reversesLedgerTransactionId_fkey" FOREIGN KEY ("reversesLedgerTransactionId") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ledger_transactions_reversesLedgerTransactionId_key" ON "ledger_transactions"("reversesLedgerTransactionId");
CREATE INDEX "payment_intents_idempotencyKey_idx" ON "payment_intents"("idempotencyKey");

CREATE TABLE "zibal_payments" (
  "id" UUID NOT NULL,
  "paymentIntentId" UUID NOT NULL,
  "status" "ZibalPaymentStatus" NOT NULL DEFAULT 'INITIATED',
  "trackId" TEXT,
  "requestToken" TEXT,
  "callbackUrl" TEXT NOT NULL,
  "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  CONSTRAINT "zibal_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "zibal_payments_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "zibal_payments_paymentIntentId_key" ON "zibal_payments"("paymentIntentId");
CREATE UNIQUE INDEX "zibal_payments_trackId_key" ON "zibal_payments"("trackId");
CREATE UNIQUE INDEX "zibal_payments_requestToken_key" ON "zibal_payments"("requestToken");
CREATE INDEX "zibal_payments_status_initiatedAt_idx" ON "zibal_payments"("status", "initiatedAt");

CREATE TABLE "wallet_accounts" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IRR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wallet_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "wallet_accounts_userId_key" ON "wallet_accounts"("userId");

CREATE TABLE "wallet_entries" (
  "id" UUID NOT NULL,
  "walletAccountId" UUID NOT NULL,
  "ledgerTransactionId" UUID,
  "balanceType" "WalletBalanceType" NOT NULL,
  "kind" "WalletEntryKind" NOT NULL,
  "source" "WalletCreditSource",
  "amount" INTEGER NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wallet_entries_walletAccountId_fkey" FOREIGN KEY ("walletAccountId") REFERENCES "wallet_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "wallet_entries_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "wallet_entries_ledgerTransactionId_key" ON "wallet_entries"("ledgerTransactionId");
CREATE INDEX "wallet_entries_walletAccountId_balanceType_createdAt_idx" ON "wallet_entries"("walletAccountId", "balanceType", "createdAt");
CREATE INDEX "wallet_entries_expiresAt_idx" ON "wallet_entries"("expiresAt");

CREATE TABLE "card_transfer_payments" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "checkoutId" UUID,
  "bookingId" UUID,
  "status" "CardTransferPaymentStatus" NOT NULL DEFAULT 'AWAITING_RECEIPT',
  "idempotencyKey" TEXT NOT NULL,
  "expectedAmount" INTEGER NOT NULL,
  "receivedAmount" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'IRR',
  "companyCardNumberMasked" TEXT NOT NULL,
  "accountHolderName" TEXT NOT NULL,
  "receiptObjectKey" TEXT,
  "receiptUploadedAt" TIMESTAMP(3),
  "receiptUploadDeadlineAt" TIMESTAMP(3) NOT NULL,
  "reviewAvailableAt" TIMESTAMP(3) NOT NULL,
  "differenceDueAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "reviewedByAdminId" UUID,
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "card_transfer_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "card_transfer_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "card_transfer_payments_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "checkouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "card_transfer_payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "card_transfer_payments_checkoutId_key" ON "card_transfer_payments"("checkoutId");
CREATE UNIQUE INDEX "card_transfer_payments_idempotencyKey_key" ON "card_transfer_payments"("idempotencyKey");
CREATE INDEX "card_transfer_payments_userId_status_idx" ON "card_transfer_payments"("userId", "status");
CREATE INDEX "card_transfer_payments_bookingId_status_idx" ON "card_transfer_payments"("bookingId", "status");
CREATE INDEX "card_transfer_payments_reviewAvailableAt_status_idx" ON "card_transfer_payments"("reviewAvailableAt", "status");

CREATE TABLE "provider_settlements" (
  "id" UUID NOT NULL,
  "reference" TEXT NOT NULL,
  "providerOrganizationId" UUID NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IRR',
  "status" "ProviderSettlementStatus" NOT NULL DEFAULT 'CALCULATED',
  "grossIrr" INTEGER NOT NULL,
  "commissionIrr" INTEGER NOT NULL DEFAULT 0,
  "refundsIrr" INTEGER NOT NULL DEFAULT 0,
  "netIrr" INTEGER NOT NULL,
  "ledgerTransactionId" UUID,
  "initiatedByAdminId" UUID,
  "approvedByAdminId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  CONSTRAINT "provider_settlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_settlements_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "provider_settlements_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "provider_settlements_reference_key" ON "provider_settlements"("reference");
CREATE UNIQUE INDEX "provider_settlements_ledgerTransactionId_key" ON "provider_settlements"("ledgerTransactionId");
CREATE INDEX "provider_settlements_providerOrganizationId_status_idx" ON "provider_settlements"("providerOrganizationId", "status");
