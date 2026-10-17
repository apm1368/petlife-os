-- CreateEnum
CREATE TYPE "PlaceSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ClaimPrepStatus" AS ENUM ('DRAFT', 'READY');


-- AlterTable
ALTER TABLE "pet_friendly_places" ADD COLUMN     "entryFeeIrr" INTEGER,
ADD COLUMN     "fencedArea" BOOLEAN,
ADD COLUMN     "parkingAvailable" BOOLEAN,
ADD COLUMN     "petFriendlyLevel" TEXT,
ADD COLUMN     "shadeAvailable" BOOLEAN,
ADD COLUMN     "smallDogArea" BOOLEAN,
ADD COLUMN     "wasteBins" BOOLEAN;

-- CreateTable
CREATE TABLE "place_suggestions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PetFriendlyPlaceCategory" NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notes" TEXT,
    "status" "PlaceSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByAdminId" UUID,
    "reviewNote" TEXT,
    "createdPlaceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "place_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_checklist_items" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_participants" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "petId" UUID,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_claim_preps" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "incidentDate" DATE,
    "notes" TEXT,
    "status" "ClaimPrepStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_claim_preps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_claim_prep_items" (
    "id" UUID NOT NULL,
    "claimPrepId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_claim_prep_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "place_suggestions_status_createdAt_idx" ON "place_suggestions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "place_suggestions_userId_idx" ON "place_suggestions"("userId");

-- CreateIndex
CREATE INDEX "trip_checklist_items_tripId_idx" ON "trip_checklist_items"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "trip_participants_tripId_petId_key" ON "trip_participants"("tripId", "petId");

-- CreateIndex
CREATE UNIQUE INDEX "trip_participants_tripId_userId_key" ON "trip_participants"("tripId", "userId");

-- CreateIndex
CREATE INDEX "insurance_claim_preps_petId_idx" ON "insurance_claim_preps"("petId");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_claim_prep_items_claimPrepId_kind_refId_key" ON "insurance_claim_prep_items"("claimPrepId", "kind", "refId");

-- AddForeignKey
ALTER TABLE "trip_checklist_items" ADD CONSTRAINT "trip_checklist_items_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_participants" ADD CONSTRAINT "trip_participants_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claim_prep_items" ADD CONSTRAINT "insurance_claim_prep_items_claimPrepId_fkey" FOREIGN KEY ("claimPrepId") REFERENCES "insurance_claim_preps"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "pet_friendly_places" ADD CONSTRAINT "pet_friendly_places_level" CHECK ("petFriendlyLevel" IS NULL OR "petFriendlyLevel" IN ('FULL', 'PARTIAL', 'OUTDOOR_ONLY'));
ALTER TABLE "pet_friendly_places" ADD CONSTRAINT "pet_friendly_places_fee" CHECK ("entryFeeIrr" IS NULL OR "entryFeeIrr" >= 0);
ALTER TABLE "trip_checklist_items" ADD CONSTRAINT "trip_checklist_items_label" CHECK (char_length(btrim("label")) BETWEEN 1 AND 120);
ALTER TABLE "trip_checklist_items" ADD CONSTRAINT "trip_checklist_items_category" CHECK ("category" IN ('DOCUMENTS', 'MEDICATION', 'FOOD', 'CARRIER', 'BOOKING', 'EMERGENCY', 'OTHER'));
ALTER TABLE "trip_participants" ADD CONSTRAINT "trip_participants_one_kind" CHECK (("petId" IS NULL) <> ("userId" IS NULL));
ALTER TABLE "insurance_claim_prep_items" ADD CONSTRAINT "insurance_claim_prep_items_kind" CHECK ("kind" IN ('MEDICAL_DOCUMENT', 'BOOKING'));
ALTER TABLE "insurance_claim_preps" ADD CONSTRAINT "insurance_claim_preps_title" CHECK (char_length(btrim("title")) BETWEEN 1 AND 120);
ALTER TABLE "place_suggestions" ADD CONSTRAINT "place_suggestions_name" CHECK (char_length(btrim("name")) BETWEEN 1 AND 200);
