-- The owner manages the company card-to-card account in admin (append-only history); payments remember which one
-- they were started with.
CREATE TABLE "card_transfer_destinations" (
    "id" UUID NOT NULL,
    "cardNumber" TEXT,
    "sheba" TEXT,
    "holderName" TEXT NOT NULL,
    "bankName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT NOT NULL,
    "createdByAdminId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedByAdminId" UUID,
    "closeReason" TEXT,

    CONSTRAINT "card_transfer_destinations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "card_transfer_destinations_active_createdAt_idx" ON "card_transfer_destinations"("active", "createdAt");

ALTER TABLE "wallet_top_ups" ADD COLUMN "cardTransferDestinationId" UUID;
ALTER TABLE "card_transfer_payments" ADD COLUMN "cardTransferDestinationId" UUID;
