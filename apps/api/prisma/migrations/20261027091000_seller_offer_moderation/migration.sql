CREATE TYPE "SellerOfferModerationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

ALTER TABLE "seller_offers"
  ADD COLUMN "moderationStatus" "SellerOfferModerationStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "moderatedAt" TIMESTAMP(3),
  ADD COLUMN "moderatedByAdminId" UUID,
  ADD COLUMN "moderationReason" TEXT;

UPDATE "seller_offers" SET "moderationStatus" = 'APPROVED' WHERE "moderationStatus" IS NULL OR "moderationStatus" = 'APPROVED';

CREATE INDEX "seller_offers_moderationStatus_idx" ON "seller_offers"("moderationStatus");
