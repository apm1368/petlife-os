-- CreateEnum
CREATE TYPE "TripChecklistState" AS ENUM ('TODO', 'DONE', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "PlaceSuggestionKind" AS ENUM ('NEW_PLACE', 'CORRECTION', 'CLOSURE_REPORT');

-- AlterTable
ALTER TABLE "place_suggestions" ADD COLUMN     "kind" "PlaceSuggestionKind" NOT NULL DEFAULT 'NEW_PLACE',
ADD COLUMN     "placeId" UUID,
ADD COLUMN     "proposedChanges" JSONB;

-- AlterTable
ALTER TABLE "trip_checklist_items" ADD COLUMN     "state" "TripChecklistState" NOT NULL DEFAULT 'TODO';

-- CreateTable
CREATE TABLE "trip_document_links" (
    "tripId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "linkedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_document_links_pkey" PRIMARY KEY ("tripId","documentId")
);

-- AddForeignKey
ALTER TABLE "trip_document_links" ADD CONSTRAINT "trip_document_links_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing items keep their meaning: done → DONE.
UPDATE "trip_checklist_items" SET "state" = 'DONE' WHERE "done" = true;
