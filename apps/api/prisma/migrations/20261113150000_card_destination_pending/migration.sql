-- BO-14: a new company card-to-card account needs a second SUPER_ADMIN. A change is now proposed as a PENDING row,
-- members keep paying into the ACTIVE one, and a different SUPER_ADMIN approves (or anyone of them rejects) it.
CREATE TYPE "CardTransferDestinationStatus" AS ENUM ('PENDING', 'ACTIVE', 'CLOSED', 'REJECTED', 'EXPIRED');

-- Existing rows keep their meaning: the active one stays ACTIVE, every earlier one is CLOSED.
ALTER TABLE "card_transfer_destinations"
    ADD COLUMN "status" "CardTransferDestinationStatus" NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN "expiresAt" TIMESTAMP(3),
    ADD COLUMN "approvedByAdminId" UUID,
    ADD COLUMN "approvedAt" TIMESTAMP(3);

UPDATE "card_transfer_destinations" SET "status" = 'CLOSED' WHERE "active" = false;

-- Payments already read only the newest active row; close any older one still flagged active so that a single
-- active account can be enforced below.
UPDATE "card_transfer_destinations"
SET "active" = false,
    "status" = 'CLOSED',
    "closedAt" = COALESCE("closedAt", CURRENT_TIMESTAMP),
    "closeReason" = COALESCE("closeReason", 'Superseded by a newer active account')
WHERE "active" = true
  AND "id" <> (SELECT "id" FROM "card_transfer_destinations" WHERE "active" = true ORDER BY "createdAt" DESC LIMIT 1);

-- New rows start as a proposal, never as the live account.
ALTER TABLE "card_transfer_destinations" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "card_transfer_destinations" ALTER COLUMN "active" SET DEFAULT false;

CREATE INDEX "card_transfer_destinations_status_createdAt_idx" ON "card_transfer_destinations"("status", "createdAt");

-- At most one proposal waiting and one live account at any time.
CREATE UNIQUE INDEX "card_transfer_destinations_one_pending_key" ON "card_transfer_destinations"("status") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "card_transfer_destinations_one_active_key" ON "card_transfer_destinations"("active") WHERE "active" = true;

-- `active` is what payments read: it may only be true for the ACTIVE row.
ALTER TABLE "card_transfer_destinations" ADD CONSTRAINT "card_transfer_destinations_active_matches_status" CHECK ("active" = ("status" = 'ACTIVE'));

-- Two-person control: the approver is never the proposer.
ALTER TABLE "card_transfer_destinations" ADD CONSTRAINT "card_transfer_destinations_second_approver" CHECK ("approvedByAdminId" IS NULL OR "approvedByAdminId" <> "createdByAdminId");
