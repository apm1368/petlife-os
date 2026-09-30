-- Batch 8 — real data exports (file, download window) and deletion request impact snapshot.
ALTER TYPE "PrivacyRequestStatus" ADD VALUE 'EXPIRED';

ALTER TABLE "data_export_requests" ADD COLUMN "fileObjectKey" TEXT;
ALTER TABLE "data_export_requests" ADD COLUMN "fileSizeBytes" INTEGER;
ALTER TABLE "data_export_requests" ADD COLUMN "downloadCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "data_export_requests" ADD COLUMN "lastDownloadedAt" TIMESTAMP(3);
CREATE INDEX "data_export_requests_status_expiresAt_idx" ON "data_export_requests"("status", "expiresAt");

ALTER TABLE "account_deletion_requests" ADD COLUMN "impactSnapshot" JSONB;
