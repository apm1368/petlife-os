-- New reviews wait for moderation. Existing PUBLISHED/HIDDEN rows retain
-- their state so this additive change does not unpublish existing content.
ALTER TABLE "provider_reviews"
  ALTER COLUMN "status" SET DEFAULT 'PENDING',
  ADD COLUMN "moderationLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "moderatedAt" TIMESTAMP(3),
  ADD COLUMN "moderatedByAdminId" UUID;

ALTER TABLE "product_reviews"
  ALTER COLUMN "status" SET DEFAULT 'PENDING',
  ADD COLUMN "moderationLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "moderatedAt" TIMESTAMP(3),
  ADD COLUMN "moderatedByAdminId" UUID;

ALTER TABLE "travel_reviews"
  ALTER COLUMN "status" SET DEFAULT 'PENDING',
  ADD COLUMN "moderationLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "moderatedAt" TIMESTAMP(3),
  ADD COLUMN "moderatedByAdminId" UUID;

CREATE INDEX "provider_reviews_status_createdAt_idx" ON "provider_reviews"("status", "createdAt");
CREATE INDEX "product_reviews_status_createdAt_idx" ON "product_reviews"("status", "createdAt");
CREATE INDEX "travel_reviews_status_createdAt_idx" ON "travel_reviews"("status", "createdAt");
