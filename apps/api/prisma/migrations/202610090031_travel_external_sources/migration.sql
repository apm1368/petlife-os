-- CreateEnum
CREATE TYPE "ExternalSourceMode" AS ENUM ('AUTOMATED', 'MANUAL', 'DISABLED');

-- CreateEnum
CREATE TYPE "ExternalAutomationStatus" AS ENUM ('SUPPORTED', 'NOT_SUPPORTED', 'BLOCKED_EXTERNAL');

-- CreateEnum
CREATE TYPE "ExternalSourceHealth" AS ENUM ('HEALTHY', 'DEGRADED', 'BLOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ExternalImagePolicy" AS ENUM ('NO_IMAGES', 'REMOTE_REFERENCE', 'CACHE_PERMITTED');

-- CreateEnum
CREATE TYPE "ExternalStayStatus" AS ENUM ('ACTIVE', 'STALE', 'SOURCE_REMOVED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ExternalPublishState" AS ENUM ('DRAFT', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PetEvidenceType" AS ENUM ('SOURCE_FILTER', 'SOURCE_AMENITY', 'SOURCE_POLICY_TEXT', 'AUTHORIZED_FEED');

-- CreateEnum
CREATE TYPE "ExternalEntryMode" AS ENUM ('MANUAL', 'AUTOMATED');

-- CreateEnum
CREATE TYPE "ExternalAvailability" AS ENUM ('UNKNOWN', 'SOURCE_REPORTED_AVAILABLE', 'SOURCE_REPORTED_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ExternalPriceBasis" AS ENUM ('TOTAL_STAY', 'PER_NIGHT');

-- CreateEnum
CREATE TYPE "ExternalObservedBy" AS ENUM ('ADAPTER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ExternalSyncKind" AS ENUM ('DISCOVERY', 'FULL', 'LISTING', 'PRICE');

-- CreateEnum
CREATE TYPE "ExternalSyncStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ExternalChangeKind" AS ENUM ('PRICE_CHANGED', 'PET_POLICY_CHANGED', 'SOURCE_REMOVED', 'IMAGE_CHANGED', 'UNAVAILABLE', 'URL_CHANGED', 'HIDDEN', 'UNHIDDEN', 'OVERRIDE_SET');

-- CreateEnum
CREATE TYPE "ExternalMatchStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');



-- CreateTable
CREATE TABLE "external_travel_sources" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "allowedHosts" TEXT[],
    "mode" "ExternalSourceMode" NOT NULL DEFAULT 'DISABLED',
    "automationStatus" "ExternalAutomationStatus" NOT NULL DEFAULT 'NOT_SUPPORTED',
    "health" "ExternalSourceHealth" NOT NULL DEFAULT 'DISABLED',
    "healthReason" TEXT,
    "discoveryNotes" JSONB,
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 1440,
    "priceTtlMinutes" INTEGER NOT NULL DEFAULT 360,
    "metadataTtlMinutes" INTEGER NOT NULL DEFAULT 2880,
    "imagePolicy" "ExternalImagePolicy" NOT NULL DEFAULT 'NO_IMAGES',
    "maxRequestsPerRun" INTEGER NOT NULL DEFAULT 50,
    "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
    "retryCount" INTEGER NOT NULL DEFAULT 2,
    "cityScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "affiliateId" TEXT,
    "trackingTemplate" TEXT,
    "campaignCode" TEXT,
    "affiliateActive" BOOLEAN NOT NULL DEFAULT false,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "circuitOpenUntil" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastErrorCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_travel_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_stays" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "sourceListingId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT,
    "area" TEXT,
    "stayType" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "capacity" INTEGER,
    "bedrooms" INTEGER,
    "beds" INTEGER,
    "petFriendly" BOOLEAN NOT NULL DEFAULT true,
    "petEvidenceType" "PetEvidenceType" NOT NULL,
    "petEvidenceText" TEXT NOT NULL,
    "petEvidenceObservedAt" TIMESTAMP(3) NOT NULL,
    "petPolicy" JSONB NOT NULL,
    "petPolicySummary" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "instantBooking" BOOLEAN,
    "descriptionSummary" TEXT,
    "status" "ExternalStayStatus" NOT NULL DEFAULT 'ACTIVE',
    "publishState" "ExternalPublishState" NOT NULL DEFAULT 'DRAFT',
    "entryMode" "ExternalEntryMode" NOT NULL,
    "createdByAdminId" UUID,
    "overrides" JSONB,
    "propertyGroupId" UUID,
    "lastSourceUpdateAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3) NOT NULL,
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_stays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_stay_price_snapshots" (
    "id" UUID NOT NULL,
    "stayId" UUID NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "guests" INTEGER NOT NULL,
    "pets" INTEGER,
    "priceIrr" INTEGER,
    "oldPriceIrr" INTEGER,
    "discountPercent" INTEGER,
    "priceBasis" "ExternalPriceBasis" NOT NULL,
    "availability" "ExternalAvailability" NOT NULL DEFAULT 'UNKNOWN',
    "observedAt" TIMESTAMP(3) NOT NULL,
    "lastConfirmedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "observedBy" "ExternalObservedBy" NOT NULL,
    "observedByAdminId" UUID,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "external_stay_price_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_stay_images" (
    "id" UUID NOT NULL,
    "stayId" UUID NOT NULL,
    "sourceImageUrl" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_stay_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_sync_runs" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "kind" "ExternalSyncKind" NOT NULL,
    "status" "ExternalSyncStatus" NOT NULL DEFAULT 'STARTED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "itemsScanned" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errorCategories" JSONB,
    "triggeredByAdminId" UUID,

    CONSTRAINT "external_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_stay_changes" (
    "id" UUID NOT NULL,
    "stayId" UUID NOT NULL,
    "kind" "ExternalChangeKind" NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_stay_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_stay_match_candidates" (
    "id" UUID NOT NULL,
    "stayAId" UUID NOT NULL,
    "stayBId" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "signals" JSONB NOT NULL,
    "status" "ExternalMatchStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByAdminId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_stay_match_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_travel_clicks" (
    "id" UUID NOT NULL,
    "stayId" UUID NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "userId" UUID,
    "searchContext" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_travel_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_stay_favorites" (
    "userId" UUID NOT NULL,
    "stayId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_stay_favorites_pkey" PRIMARY KEY ("userId","stayId")
);

-- CreateTable
CREATE TABLE "trip_external_stays" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "stayId" UUID NOT NULL,
    "priceSnapshotId" UUID,
    "state" TEXT NOT NULL DEFAULT 'PLANNED_EXTERNAL_STAY',
    "addedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_external_stays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_travel_sources_code_key" ON "external_travel_sources"("code");

-- CreateIndex
CREATE INDEX "external_stays_city_status_publishState_idx" ON "external_stays"("city", "status", "publishState");

-- CreateIndex
CREATE UNIQUE INDEX "external_stays_sourceId_sourceListingId_key" ON "external_stays"("sourceId", "sourceListingId");

-- CreateIndex
CREATE INDEX "external_stay_price_snapshots_stayId_checkIn_checkOut_guest_idx" ON "external_stay_price_snapshots"("stayId", "checkIn", "checkOut", "guests", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "external_stay_images_stayId_position_key" ON "external_stay_images"("stayId", "position");

-- CreateIndex
CREATE INDEX "external_sync_runs_sourceId_startedAt_idx" ON "external_sync_runs"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "external_stay_changes_stayId_createdAt_idx" ON "external_stay_changes"("stayId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "external_stay_match_candidates_stayAId_stayBId_key" ON "external_stay_match_candidates"("stayAId", "stayBId");

-- CreateIndex
CREATE INDEX "outbound_travel_clicks_stayId_createdAt_idx" ON "outbound_travel_clicks"("stayId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "trip_external_stays_tripId_stayId_key" ON "trip_external_stays"("tripId", "stayId");

-- AddForeignKey
ALTER TABLE "external_stays" ADD CONSTRAINT "external_stays_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "external_travel_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_stay_price_snapshots" ADD CONSTRAINT "external_stay_price_snapshots_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "external_stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_stay_images" ADD CONSTRAINT "external_stay_images_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "external_stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_sync_runs" ADD CONSTRAINT "external_sync_runs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "external_travel_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_stay_changes" ADD CONSTRAINT "external_stay_changes_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "external_stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_travel_clicks" ADD CONSTRAINT "outbound_travel_clicks_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "external_stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_stay_favorites" ADD CONSTRAINT "external_stay_favorites_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "external_stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_external_stays" ADD CONSTRAINT "trip_external_stays_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "external_stays"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Initial sources (configuration, not data). Discovery evidence 2026-10-09: no public API/authorized feed found; both
-- WAFs answer this server's identified requests — including robots.txt — with HTTP 403. Automation stays off; staff can
-- record listings manually with source evidence. No listing is created here.
INSERT INTO "external_travel_sources" ("id", "code", "nameFa", "nameEn", "allowedHosts", "mode", "automationStatus", "health", "healthReason", "discoveryNotes", "updatedAt") VALUES
  (gen_random_uuid(), 'JABAMA', 'جاباما', 'Jabama', ARRAY['jabama.com'], 'MANUAL', 'BLOCKED_EXTERNAL', 'BLOCKED', 'WAF rejects automated access from the server (HTTP 403 on robots.txt); no public API or authorized feed known', '{"checkedAt":"2026-10-09","officialApi":"NOT_FOUND","authorizedFeed":"NOT_FOUND","robotsTxt":"HTTP 403 Request Rejected (support id 16455553345738847478)","petFriendlyFilter":"NOT_CONFIRMED (not visible on homepage; search pages unreachable from server)","note":"Alibaba states Jabama-registered stays are also listed on alibaba.ir"}'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ALIBABA', 'علی‌بابا', 'Alibaba', ARRAY['alibaba.ir'], 'MANUAL', 'BLOCKED_EXTERNAL', 'BLOCKED', 'WAF rejects automated access from the server (HTTP 403 unusual-traffic page on robots.txt); no public API or authorized feed known', '{"checkedAt":"2026-10-09","officialApi":"NOT_FOUND","authorizedFeed":"NOT_FOUND","robotsTxt":"HTTP 403 unusual traffic page (support id 15227085445141492039)","petFriendlyFilter":"NOT_CONFIRMED"}'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OTAGHAK', 'اتاقک', 'Otaghak', ARRAY['otaghak.com'], 'DISABLED', 'NOT_SUPPORTED', 'DISABLED', 'Not investigated yet', NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'JAJIGA', 'جاجیگا', 'Jajiga', ARRAY['jajiga.com'], 'DISABLED', 'NOT_SUPPORTED', 'DISABLED', 'Not investigated yet', NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SHAB', 'شب', 'Shab', ARRAY['shab.ir'], 'DISABLED', 'NOT_SUPPORTED', 'DISABLED', 'Not investigated yet', NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
