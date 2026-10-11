-- CreateEnum
CREATE TYPE "ExternalSourceType" AS ENUM ('SCRAPED_PUBLIC_WEB', 'UNOFFICIAL_PUBLIC_WEB_ENDPOINT', 'PARTNER_API', 'AUTHORIZED_FEED', 'MANUAL_ENTRY');

-- CreateEnum
CREATE TYPE "ExternalSourceAccessStatus" AS ENUM ('UNVERIFIED', 'VERIFIED_PUBLIC', 'TOOL_PERMISSION_BLOCKED', 'BLOCKED_BY_SOURCE');

-- CreateEnum
CREATE TYPE "PetPolicyStatus" AS ENUM ('CONFIRMED_ALLOWED', 'CONFIRMED_NOT_ALLOWED', 'AMBIGUOUS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PetPolicyAuthority" AS ENUM ('SOURCE_OBSERVATION', 'ADMIN_CONFIRMED');

-- CreateEnum
CREATE TYPE "ExternalPriceType" AS ENUM ('EXACT', 'FROM_PRICE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ExternalSyncTrigger" AS ENUM ('SCHEDULED', 'MANUAL', 'RETRY');

-- AlterEnum
ALTER TYPE "AdminTaskSource" ADD VALUE 'TRAVEL_SOURCE';

-- AlterEnum
ALTER TYPE "ExternalChangeKind" ADD VALUE 'CREATED';
ALTER TYPE "ExternalChangeKind" ADD VALUE 'FIELD_CHANGED';
ALTER TYPE "ExternalChangeKind" ADD VALUE 'STALE';
ALTER TYPE "ExternalChangeKind" ADD VALUE 'REAPPEARED';
ALTER TYPE "ExternalChangeKind" ADD VALUE 'PET_POLICY_CONFLICT';
ALTER TYPE "ExternalChangeKind" ADD VALUE 'PET_POLICY_REVIEWED';

-- AlterEnum
ALTER TYPE "ExternalStayStatus" ADD VALUE 'DISCOVERED';



-- AlterTable
ALTER TABLE "external_stay_changes" ADD COLUMN     "field" TEXT,
ADD COLUMN     "newValue" JSONB,
ADD COLUMN     "oldValue" JSONB,
ADD COLUMN     "runId" UUID;

-- AlterTable
ALTER TABLE "external_stay_price_snapshots" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'IRR',
ADD COLUMN     "priceType" "ExternalPriceType" NOT NULL DEFAULT 'EXACT',
ADD COLUMN     "runId" UUID,
ALTER COLUMN "checkIn" DROP NOT NULL,
ALTER COLUMN "checkOut" DROP NOT NULL;

-- AlterTable
ALTER TABLE "external_stays" ADD COLUMN     "addressText" TEXT,
ADD COLUMN     "adminPetPolicyAt" TIMESTAMP(3),
ADD COLUMN     "adminPetPolicyById" UUID,
ADD COLUMN     "adminPetPolicyNote" TEXT,
ADD COLUMN     "adminPetPolicyStatus" "PetPolicyStatus",
ADD COLUMN     "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "canonicalAccommodationId" UUID,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "firstSeenAt" TIMESTAMP(3),
ADD COLUMN     "lastChangedAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "missedRuns" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "normalizedFingerprint" TEXT,
ADD COLUMN     "petPolicyStatus" "PetPolicyStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "rawFingerprint" TEXT,
ADD COLUMN     "sourceType" "ExternalSourceType" NOT NULL DEFAULT 'MANUAL_ENTRY',
ALTER COLUMN "petFriendly" SET DEFAULT false,
ALTER COLUMN "petEvidenceType" DROP NOT NULL,
ALTER COLUMN "petEvidenceText" DROP NOT NULL,
ALTER COLUMN "petEvidenceObservedAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "external_sync_runs" ADD COLUMN     "anomaly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "errors" JSONB,
ADD COLUMN     "listingsDiscovered" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pagesRequested" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "removed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "staleMarked" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trigger" "ExternalSyncTrigger" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "external_travel_sources" ADD COLUMN     "accessStatus" "ExternalSourceAccessStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "anomalyDropRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
ADD COLUMN     "lastDurationMs" INTEGER,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastListingsSeen" INTEGER,
ADD COLUMN     "lastRunStatus" "ExternalSyncStatus",
ADD COLUMN     "priceAgingHours" INTEGER NOT NULL DEFAULT 72,
ADD COLUMN     "priceFreshHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "rawRetentionDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "removeAfterMissedRuns" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "requestDelayMaxMs" INTEGER NOT NULL DEFAULT 3000,
ADD COLUMN     "requestDelayMinMs" INTEGER NOT NULL DEFAULT 1500,
ADD COLUMN     "robotsCheckedAt" TIMESTAMP(3),
ADD COLUMN     "robotsResult" TEXT,
ADD COLUMN     "sourceType" "ExternalSourceType" NOT NULL DEFAULT 'SCRAPED_PUBLIC_WEB',
ADD COLUMN     "staleAfterMissedRuns" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "termsCheckedAt" TIMESTAMP(3),
ADD COLUMN     "termsUrl" TEXT;

-- CreateTable
CREATE TABLE "canonical_accommodations" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canonical_accommodations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_stay_observations" (
    "id" UUID NOT NULL,
    "stayId" UUID NOT NULL,
    "runId" UUID,
    "sourceListingId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawFingerprint" TEXT NOT NULL,
    "normalizedFingerprint" TEXT NOT NULL,
    "normalized" JSONB NOT NULL,
    "rawExcerpt" JSONB,

    CONSTRAINT "external_stay_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_pet_policy_evidence" (
    "id" UUID NOT NULL,
    "stayId" UUID NOT NULL,
    "runId" UUID,
    "status" "PetPolicyStatus" NOT NULL,
    "authority" "PetPolicyAuthority" NOT NULL,
    "dogsAllowed" BOOLEAN,
    "catsAllowed" BOOLEAN,
    "otherPetsAllowed" BOOLEAN,
    "maxPets" INTEGER,
    "maxWeightKg" DOUBLE PRECISION,
    "petFeeIrr" INTEGER,
    "depositIrr" INTEGER,
    "restrictions" TEXT,
    "allowedAreas" TEXT,
    "notes" TEXT,
    "evidenceSource" TEXT,
    "evidenceUrl" TEXT,
    "evidenceText" TEXT,
    "evidencePath" TEXT,
    "evidenceObservedAt" TIMESTAMP(3) NOT NULL,
    "lastConfirmedAt" TIMESTAMP(3) NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "adminUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_pet_policy_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_stay_observations_stayId_observedAt_idx" ON "external_stay_observations"("stayId", "observedAt");

-- CreateIndex
CREATE INDEX "external_stay_observations_observedAt_idx" ON "external_stay_observations"("observedAt");

-- CreateIndex
CREATE INDEX "external_pet_policy_evidence_stayId_createdAt_idx" ON "external_pet_policy_evidence"("stayId", "createdAt");

-- CreateIndex
CREATE INDEX "external_pet_policy_evidence_status_createdAt_idx" ON "external_pet_policy_evidence"("status", "createdAt");

-- CreateIndex
CREATE INDEX "external_stay_changes_createdAt_kind_idx" ON "external_stay_changes"("createdAt", "kind");

-- CreateIndex
CREATE INDEX "external_stays_petPolicyStatus_idx" ON "external_stays"("petPolicyStatus");

-- AddForeignKey
ALTER TABLE "external_stays" ADD CONSTRAINT "external_stays_canonicalAccommodationId_fkey" FOREIGN KEY ("canonicalAccommodationId") REFERENCES "canonical_accommodations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_stay_observations" ADD CONSTRAINT "external_stay_observations_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "external_stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_pet_policy_evidence" ADD CONSTRAINT "external_pet_policy_evidence_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "external_stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data: approved cross-source groups become canonical accommodations (same id), then the old group column goes.
INSERT INTO "canonical_accommodations" ("id", "title", "city", "province", "latitude", "longitude", "createdAt", "updatedAt")
SELECT DISTINCT ON ("propertyGroupId") "propertyGroupId", "title", "city", "province", "latitude", "longitude", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "external_stays" WHERE "propertyGroupId" IS NOT NULL ORDER BY "propertyGroupId", "createdAt";
UPDATE "external_stays" SET "canonicalAccommodationId" = "propertyGroupId" WHERE "propertyGroupId" IS NOT NULL;
ALTER TABLE "external_stays" DROP COLUMN "propertyGroupId";

-- Data: every pre-existing listing entered with explicit source pet evidence (TRAVEL-EXT-1 required it).
UPDATE "external_stays" SET
  "petPolicyStatus" = CASE WHEN "petEvidenceText" IS NOT NULL AND "petFriendly" THEN 'CONFIRMED_ALLOWED'::"PetPolicyStatus" ELSE 'UNKNOWN'::"PetPolicyStatus" END,
  "sourceType" = CASE WHEN "entryMode" = 'MANUAL' THEN 'MANUAL_ENTRY'::"ExternalSourceType" ELSE 'SCRAPED_PUBLIC_WEB'::"ExternalSourceType" END,
  "firstSeenAt" = "createdAt", "lastSeenAt" = "lastCheckedAt", "lastChangedAt" = "updatedAt";
INSERT INTO "external_pet_policy_evidence" ("id", "stayId", "status", "authority", "evidenceSource", "evidenceUrl", "evidenceText", "evidenceObservedAt", "lastConfirmedAt", "fingerprint", "adminUserId", "createdAt")
SELECT gen_random_uuid(), "id", 'CONFIRMED_ALLOWED', 'SOURCE_OBSERVATION', "petEvidenceType"::text, "sourceUrl", LEFT("petEvidenceText", 300), "petEvidenceObservedAt", "petEvidenceObservedAt", md5(COALESCE("petEvidenceText", '')), "createdByAdminId", CURRENT_TIMESTAMP
FROM "external_stays" WHERE "petEvidenceText" IS NOT NULL AND "petEvidenceObservedAt" IS NOT NULL;

-- Sources: owner approved demo ingestion of publicly accessible data (2026-10-11). Parsers stay off until the real
-- public payloads have been observed; nothing here claims a partnership or an affiliate relationship.
UPDATE "external_travel_sources" SET
  "sourceType" = 'UNOFFICIAL_PUBLIC_WEB_ENDPOINT', "accessStatus" = 'TOOL_PERMISSION_BLOCKED', "autoPublish" = true, "imagePolicy" = 'REMOTE_REFERENCE',
  "robotsCheckedAt" = '2026-10-11T11:00:00Z', "robotsResult" = 'HTTP 200; "User-agent: *" with no Disallow; sitemap lists 34 /accommodation category pages',
  "healthReason" = 'Public landing endpoint verified (HTTP 200, no auth). Search/detail payloads not yet observed: development tool permission blocked the probe, not the source. Parser pending.',
  "discoveryNotes" = COALESCE("discoveryNotes", '{}'::jsonb) || '{"demoIngestionApprovedAt":"2026-10-11","strategy":"UNOFFICIAL_PUBLIC_WEB_ENDPOINT","publicEndpoints":{"landing":"GET https://ws.alibaba.ir/api/v1/accom/landing/landing-pages/path/{slug}","search":"POST https://ws.alibaba.ir/api/v2/accommodation/Available/Search","details":"GET https://ws.alibaba.ir/api/v2/accommodation/Available/GetDetails/{id}"},"landingProbe":{"at":"2026-10-11","status":200,"auth":"NONE","unauthorizedRequest":false,"observedFields":["availableSearch.destination (e.g. city-ramsar)","minPrice (IRR, FROM_PRICE)","accommodationFilters.types","landingPageTitle"]},"searchProbe":"TOOL_PERMISSION_BLOCKED (not a source response)","detailsProbe":"NOT_ATTEMPTED","petFilter":"NOT_CONFIRMED"}'::jsonb
WHERE "code" = 'ALIBABA';
UPDATE "external_travel_sources" SET
  "sourceType" = 'SCRAPED_PUBLIC_WEB', "accessStatus" = 'UNVERIFIED', "autoPublish" = true, "imagePolicy" = 'REMOTE_REFERENCE',
  "robotsCheckedAt" = '2026-10-11T00:00:00Z', "robotsResult" = 'HTTP 200; permissive; sitemap.xml HTTP 410',
  "healthReason" = 'Public discovery strategy not yet verified (waits on the Alibaba contract). Parser pending.',
  "discoveryNotes" = COALESCE("discoveryNotes", '{}'::jsonb) || '{"demoIngestionApprovedAt":"2026-10-11","strategy":"PENDING_DISCOVERY","petFilter":"NOT_CONFIRMED"}'::jsonb
WHERE "code" = 'JABAMA';
