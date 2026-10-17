-- Batch 6: the user report queue covers animal-support needs, lost-pet incidents, sightings and
-- organizations; broader report reasons; matching Trust & Safety subject types. Additive only.
ALTER TYPE "CommunityReportReason" ADD VALUE IF NOT EXISTS 'SCAM';
ALTER TYPE "CommunityReportReason" ADD VALUE IF NOT EXISTS 'HARASSMENT';
ALTER TYPE "CommunityReportReason" ADD VALUE IF NOT EXISTS 'PERSONAL_INFORMATION';
ALTER TYPE "CommunityReportReason" ADD VALUE IF NOT EXISTS 'ANIMAL_WELFARE';
ALTER TYPE "CommunityReportReason" ADD VALUE IF NOT EXISTS 'DANGEROUS_CONTENT';
ALTER TYPE "TrustSubjectType" ADD VALUE IF NOT EXISTS 'SUPPORT_NEED';
ALTER TYPE "TrustSubjectType" ADD VALUE IF NOT EXISTS 'LOST_PET_SIGHTING';
ALTER TYPE "TrustSubjectType" ADD VALUE IF NOT EXISTS 'ANIMAL_SUPPORT_ORGANIZATION';

ALTER TABLE "community_reports" ADD COLUMN "supportNeedListingId" UUID;
ALTER TABLE "community_reports" ADD COLUMN "lostPetIncidentId" UUID;
ALTER TABLE "community_reports" ADD COLUMN "lostPetSightingId" UUID;
ALTER TABLE "community_reports" ADD COLUMN "organizationId" UUID;
CREATE INDEX "community_reports_supportNeedListingId_idx" ON "community_reports"("supportNeedListingId");
CREATE INDEX "community_reports_lostPetIncidentId_idx" ON "community_reports"("lostPetIncidentId");
CREATE INDEX "community_reports_lostPetSightingId_idx" ON "community_reports"("lostPetSightingId");
CREATE INDEX "community_reports_organizationId_idx" ON "community_reports"("organizationId");
CREATE INDEX "community_reports_reporterUserId_idx" ON "community_reports"("reporterUserId");
-- Exactly one target per report.
-- The Phase-1 check only knew posts and comments; the single-target check below supersedes it.
ALTER TABLE "community_reports" DROP CONSTRAINT "community_reports_target_present";
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_single_target" CHECK (
  (("postId" IS NOT NULL)::int + ("commentId" IS NOT NULL)::int + ("supportNeedListingId" IS NOT NULL)::int + ("lostPetIncidentId" IS NOT NULL)::int + ("lostPetSightingId" IS NOT NULL)::int + ("organizationId" IS NOT NULL)::int) = 1
);
