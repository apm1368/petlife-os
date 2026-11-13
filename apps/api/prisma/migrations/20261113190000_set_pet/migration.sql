-- «ست پت» Set Pet requests (owner, 2026-11-13): order requests for matching printed outfits, private design files,
-- fixed print zones and a status timeline. Payment is outside these tables.

-- CreateEnum
CREATE TYPE "SetPetRequestStatus" AS ENUM ('SUBMITTED', 'QUOTED', 'CONFIRMED', 'IN_PRODUCTION', 'SHIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SetPetSize" AS ENUM ('S', 'M', 'L', 'XL', 'XXL', 'XXXL');

-- CreateEnum
CREATE TYPE "SetPetZone" AS ENUM ('RIGHT_UPPER_ARM', 'LEFT_UPPER_ARM', 'FRONT_CENTER', 'BACK', 'PET_BACK');

-- CreateEnum
CREATE TYPE "SetPetDesignFileStatus" AS ENUM ('PENDING_UPLOAD', 'READY', 'REJECTED');

-- CreateEnum
CREATE TYPE "SetPetActor" AS ENUM ('MEMBER', 'STAFF');

-- CreateTable
CREATE TABLE "set_pet_requests" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "userId" UUID NOT NULL,
    "petId" UUID,
    "status" "SetPetRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "humanColour" TEXT NOT NULL,
    "humanSizes" "SetPetSize"[],
    "petSize" "SetPetSize" NOT NULL,
    "petColour" TEXT NOT NULL,
    "petNeckCm" DECIMAL(5,1) NOT NULL,
    "petChestCm" DECIMAL(5,1) NOT NULL,
    "petBackLengthCm" DECIMAL(5,1) NOT NULL,
    "petWeightKg" DECIMAL(5,2) NOT NULL,
    "notes" TEXT,
    "quoteAmountIrr" INTEGER,
    "quoteNote" TEXT,
    "estimatedReadyAt" TIMESTAMP(3),
    "quotedAt" TIMESTAMP(3),
    "quotedByAdminUserId" UUID,
    "confirmedAt" TIMESTAMP(3),
    "productionStartedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "shippingNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" "SetPetActor",
    "cancelReason" TEXT,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "set_pet_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "set_pet_design_files" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "requestId" UUID,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "originalFilename" TEXT,
    "previewable" BOOLEAN NOT NULL DEFAULT false,
    "status" "SetPetDesignFileStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "rejectReason" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "set_pet_design_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "set_pet_placements" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "zone" "SetPetZone" NOT NULL,
    "designFileId" UUID NOT NULL,

    CONSTRAINT "set_pet_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "set_pet_request_events" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "fromStatus" "SetPetRequestStatus",
    "toStatus" "SetPetRequestStatus" NOT NULL,
    "actor" "SetPetActor" NOT NULL,
    "actorUserId" UUID,
    "adminUserId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "set_pet_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "set_pet_requests_number_key" ON "set_pet_requests"("number");

-- CreateIndex
CREATE INDEX "set_pet_requests_userId_createdAt_idx" ON "set_pet_requests"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "set_pet_requests_status_createdAt_idx" ON "set_pet_requests"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "set_pet_design_files_objectKey_key" ON "set_pet_design_files"("objectKey");

-- CreateIndex
CREATE INDEX "set_pet_design_files_userId_createdAt_idx" ON "set_pet_design_files"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "set_pet_design_files_requestId_idx" ON "set_pet_design_files"("requestId");

-- CreateIndex
CREATE INDEX "set_pet_placements_designFileId_idx" ON "set_pet_placements"("designFileId");

-- CreateIndex
CREATE UNIQUE INDEX "set_pet_placements_requestId_zone_key" ON "set_pet_placements"("requestId", "zone");

-- CreateIndex
CREATE INDEX "set_pet_request_events_requestId_createdAt_idx" ON "set_pet_request_events"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "set_pet_requests" ADD CONSTRAINT "set_pet_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_pet_requests" ADD CONSTRAINT "set_pet_requests_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_pet_design_files" ADD CONSTRAINT "set_pet_design_files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_pet_design_files" ADD CONSTRAINT "set_pet_design_files_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "set_pet_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_pet_placements" ADD CONSTRAINT "set_pet_placements_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "set_pet_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_pet_placements" ADD CONSTRAINT "set_pet_placements_designFileId_fkey" FOREIGN KEY ("designFileId") REFERENCES "set_pet_design_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_pet_request_events" ADD CONSTRAINT "set_pet_request_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "set_pet_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity the API also enforces: 1–10 human garments, a positive quote, plausible pet measurements.
ALTER TABLE "set_pet_requests" ADD CONSTRAINT "set_pet_requests_human_sizes_count" CHECK (cardinality("humanSizes") BETWEEN 1 AND 10);
ALTER TABLE "set_pet_requests" ADD CONSTRAINT "set_pet_requests_quote_positive" CHECK ("quoteAmountIrr" IS NULL OR "quoteAmountIrr" > 0);
ALTER TABLE "set_pet_requests" ADD CONSTRAINT "set_pet_requests_pet_measurements" CHECK ("petNeckCm" > 0 AND "petChestCm" > 0 AND "petBackLengthCm" > 0 AND "petWeightKg" > 0);
