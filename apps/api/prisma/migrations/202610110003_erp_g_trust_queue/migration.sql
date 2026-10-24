

-- AlterTable
ALTER TABLE "community_reports" ADD COLUMN     "assignedAdminId" UUID,
ADD COLUMN     "assignedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "place_reports" ADD COLUMN     "assignedAdminId" UUID,
ADD COLUMN     "assignedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "community_reports_status_createdAt_idx" ON "community_reports"("status", "createdAt");

