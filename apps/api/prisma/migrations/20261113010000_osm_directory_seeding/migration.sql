-- OpenStreetMap directory seeding: new place categories, OSM identity/tags on places, claims, sync areas and runs.

-- CreateEnum
CREATE TYPE "PlaceClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- AlterEnum


ALTER TYPE "PetFriendlyPlaceCategory" ADD VALUE 'VETERINARY';
ALTER TYPE "PetFriendlyPlaceCategory" ADD VALUE 'PET_SHOP';
ALTER TYPE "PetFriendlyPlaceCategory" ADD VALUE 'GROOMING';
ALTER TYPE "PetFriendlyPlaceCategory" ADD VALUE 'BOARDING';
ALTER TYPE "PetFriendlyPlaceCategory" ADD VALUE 'SHELTER';
ALTER TYPE "PetFriendlyPlaceCategory" ADD VALUE 'DOG_PARK';

-- AlterTable
ALTER TABLE "pet_friendly_places" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "claimedByProviderOrganizationId" UUID,
ADD COLUMN     "osmId" BIGINT,
ADD COLUMN     "osmMissingSince" TIMESTAMP(3),
ADD COLUMN     "osmEditedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "osmSyncedAt" TIMESTAMP(3),
ADD COLUMN     "osmTags" JSONB,
ADD COLUMN     "osmType" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "place_claims" (
    "id" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerOrganizationId" UUID,
    "status" "PlaceClaimStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "decisionReason" TEXT,
    "decidedByAdminId" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "place_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "osm_sync_areas" (
    "id" UUID NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT,
    "south" DOUBLE PRECISION NOT NULL,
    "west" DOUBLE PRECISION NOT NULL,
    "north" DOUBLE PRECISION NOT NULL,
    "east" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "osm_sync_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "osm_import_runs" (
    "id" UUID NOT NULL,
    "areaId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "linked" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "hidden" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "requestedByAdminId" UUID,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "osm_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "place_claims_status_createdAt_idx" ON "place_claims"("status", "createdAt");

-- CreateIndex
CREATE INDEX "place_claims_placeId_idx" ON "place_claims"("placeId");

-- CreateIndex
CREATE INDEX "place_claims_userId_idx" ON "place_claims"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "osm_sync_areas_city_key" ON "osm_sync_areas"("city");

-- CreateIndex
CREATE INDEX "osm_import_runs_areaId_startedAt_idx" ON "osm_import_runs"("areaId", "startedAt");

-- CreateIndex
CREATE INDEX "pet_friendly_places_source_city_idx" ON "pet_friendly_places"("source", "city");

-- CreateIndex
CREATE UNIQUE INDEX "pet_friendly_places_osmType_osmId_key" ON "pet_friendly_places"("osmType", "osmId");

-- AddForeignKey
ALTER TABLE "place_claims" ADD CONSTRAINT "place_claims_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "pet_friendly_places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "osm_import_runs" ADD CONSTRAINT "osm_import_runs_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "osm_sync_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Starting areas (city bounding boxes, south/west/north/east). Staff can add, adjust or pause areas in admin.
INSERT INTO "osm_sync_areas" ("id", "city", "province", "south", "west", "north", "east", "active", "updatedAt") VALUES
  (gen_random_uuid(), 'تهران', 'تهران', 35.56, 51.09, 35.84, 51.62, true, now()),
  (gen_random_uuid(), 'کرج', 'البرز', 35.74, 50.86, 35.89, 51.08, true, now()),
  (gen_random_uuid(), 'مشهد', 'خراسان رضوی', 36.20, 59.43, 36.43, 59.73, true, now()),
  (gen_random_uuid(), 'اصفهان', 'اصفهان', 32.55, 51.56, 32.74, 51.80, true, now()),
  (gen_random_uuid(), 'شیراز', 'فارس', 29.53, 52.42, 29.72, 52.65, true, now()),
  (gen_random_uuid(), 'تبریز', 'آذربایجان شرقی', 37.99, 46.17, 38.14, 46.42, true, now()),
  (gen_random_uuid(), 'قم', 'قم', 34.57, 50.80, 34.70, 50.96, true, now()),
  (gen_random_uuid(), 'اهواز', 'خوزستان', 31.23, 48.57, 31.40, 48.78, true, now()),
  (gen_random_uuid(), 'رشت', 'گیلان', 37.22, 49.53, 37.33, 49.66, true, now()),
  (gen_random_uuid(), 'کرمانشاه', 'کرمانشاه', 34.27, 46.98, 34.40, 47.18, true, now()),
  (gen_random_uuid(), 'یزد', 'یزد', 31.82, 54.27, 31.95, 54.44, true, now()),
  (gen_random_uuid(), 'کیش', 'هرمزگان', 26.48, 53.88, 26.60, 54.07, true, now())
ON CONFLICT ("city") DO NOTHING;
