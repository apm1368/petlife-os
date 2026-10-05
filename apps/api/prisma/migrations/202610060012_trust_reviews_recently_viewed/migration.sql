-- AlterEnum
ALTER TYPE "AppealStatus" ADD VALUE 'WITHDRAWN';



-- AlterTable
ALTER TABLE "provider_reviews" ADD COLUMN     "communication" INTEGER,
ADD COLUMN     "quality" INTEGER,
ADD COLUMN     "respondedByUserId" UUID,
ADD COLUMN     "responseEditedAt" TIMESTAMP(3),
ADD COLUMN     "timeliness" INTEGER;

-- AlterTable
ALTER TABLE "travel_reviews" ADD COLUMN     "accuracy" INTEGER;

-- CreateTable
CREATE TABLE "recently_viewed" (
    "userId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recently_viewed_pkey" PRIMARY KEY ("userId","entityType","entityId")
);

-- CreateIndex
CREATE INDEX "recently_viewed_userId_viewedAt_idx" ON "recently_viewed"("userId", "viewedAt");


ALTER TABLE "provider_reviews" ADD CONSTRAINT "provider_reviews_dimensions" CHECK (
  ("quality" IS NULL OR "quality" BETWEEN 1 AND 5) AND ("communication" IS NULL OR "communication" BETWEEN 1 AND 5) AND ("timeliness" IS NULL OR "timeliness" BETWEEN 1 AND 5));
ALTER TABLE "travel_reviews" ADD CONSTRAINT "travel_reviews_accuracy" CHECK ("accuracy" IS NULL OR "accuracy" BETWEEN 1 AND 5);
ALTER TABLE "recently_viewed" ADD CONSTRAINT "recently_viewed_type" CHECK ("entityType" IN ('PROVIDER', 'PRODUCT', 'TRAVEL_LISTING', 'PLACE', 'ARTICLE', 'SUPPORT_NEED'));
