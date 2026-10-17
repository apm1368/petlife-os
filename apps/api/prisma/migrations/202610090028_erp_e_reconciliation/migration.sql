-- CreateEnum
CREATE TYPE "ReconciliationCheck" AS ENUM ('INTENT_TRANSACTION', 'TRANSACTION_LEDGER', 'REFUND_ORIGINAL', 'BOOKING_CAPTURE', 'ORDER_CAPTURE', 'DONATION_LEDGER', 'SETTLEMENT_LEDGER', 'LEDGER_BALANCE');

-- CreateEnum
CREATE TYPE "ReconciliationOutcome" AS ENUM ('MISMATCH', 'MISSING', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "ReconciliationFindingStatus" AS ENUM ('OPEN', 'RESOLVED', 'CLEARED');



-- AlterTable
ALTER TABLE "seller_settlements" ADD COLUMN     "heldAt" TIMESTAMP(3),
ADD COLUMN     "heldByAdminId" UUID,
ADD COLUMN     "holdReason" TEXT,
ADD COLUMN     "onHold" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "finance_reconciliation_findings" (
    "id" UUID NOT NULL,
    "check" "ReconciliationCheck" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "outcome" "ReconciliationOutcome" NOT NULL,
    "detail" JSONB NOT NULL,
    "status" "ReconciliationFindingStatus" NOT NULL DEFAULT 'OPEN',
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAdminId" UUID,
    "resolution" TEXT,
    "resolutionNote" TEXT,
    "taskDedupeKey" TEXT,

    CONSTRAINT "finance_reconciliation_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_reconciliation_findings_status_check_idx" ON "finance_reconciliation_findings"("status", "check");

-- CreateIndex
CREATE UNIQUE INDEX "finance_reconciliation_findings_check_entityType_entityId_key" ON "finance_reconciliation_findings"("check", "entityType", "entityId");

