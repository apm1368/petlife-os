CREATE TYPE "ProductModerationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

ALTER TABLE "products"
  ADD COLUMN "moderationStatus" "ProductModerationStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "moderatedAt" TIMESTAMP(3),
  ADD COLUMN "moderatedByAdminId" UUID,
  ADD COLUMN "moderationReason" TEXT;

UPDATE "products" SET "moderationStatus" = 'APPROVED' WHERE "moderationStatus" IS NULL OR "moderationStatus" = 'APPROVED';

CREATE INDEX "products_moderationStatus_idx" ON "products"("moderationStatus");
