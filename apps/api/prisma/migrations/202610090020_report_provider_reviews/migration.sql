
-- AlterTable
ALTER TABLE "community_reports" ADD COLUMN     "providerReviewId" UUID;

-- CreateIndex
CREATE INDEX "community_reports_providerReviewId_idx" ON "community_reports"("providerReviewId");

