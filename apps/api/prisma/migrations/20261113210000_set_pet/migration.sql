-- «ست پت» Set Pet (owner, 2026-11-13; answers in issue #368): custom-printed matching outfits for a member and their
-- pets. Fixed price table, print proofs, orders with garments and print zones, private design files, auto-saved drafts
-- and a status timeline. Payment is a wallet debit (WalletEntry/LedgerTransaction reference SET_PET_ORDER).

-- CreateEnum
CREATE TYPE "SetPetRequestStatus" AS ENUM ('SUBMITTED', 'NEEDS_NEW_DESIGN', 'PROOF_SENT', 'AWAITING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SetPetSize" AS ENUM ('S', 'M', 'L', 'XL', 'XXL', 'XXXL');

-- CreateEnum
CREATE TYPE "SetPetGarment" AS ENUM ('HUMAN_TEE', 'HUMAN_HOODIE', 'HUMAN_SWEATSHIRT', 'PET_TEE', 'PET_HOODIE', 'PET_BANDANA');

-- CreateEnum
CREATE TYPE "SetPetZone" AS ENUM ('RIGHT_UPPER_ARM', 'LEFT_UPPER_ARM', 'FRONT_CENTER', 'BACK', 'PET_BACK');

-- CreateEnum
CREATE TYPE "SetPetFont" AS ENUM ('VAZIRMATN', 'LALEZAR', 'AMIRI');

-- CreateEnum
CREATE TYPE "SetPetDesignFileStatus" AS ENUM ('PENDING_UPLOAD', 'READY', 'REJECTED');

-- CreateEnum
CREATE TYPE "SetPetActor" AS ENUM ('MEMBER', 'STAFF');

-- CreateEnum
CREATE TYPE "SetPetProofStatus" AS ENUM ('UPLOADING', 'SENT', 'APPROVED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "set_pet_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "garmentPricesIrr" JSONB NOT NULL DEFAULT '{}',
    "zonePricesIrr" JSONB NOT NULL DEFAULT '{}',
    "setDiscountPercent" INTEGER NOT NULL DEFAULT 0,
    "productionWorkingDays" INTEGER NOT NULL DEFAULT 5,
    "workshopCity" TEXT,
    "workshopLatitude" DOUBLE PRECISION,
    "workshopLongitude" DOUBLE PRECISION,
    "updatedByAdminUserId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "set_pet_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "set_pet_drafts" (
    "userId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "set_pet_drafts_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "set_pet_requests" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "userId" UUID NOT NULL,
    "status" "SetPetRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "forPetId" UUID,
    "notes" TEXT,
    "reorderOfId" UUID,
    "priceLines" JSONB NOT NULL,
    "subtotalIrr" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "discountIrr" INTEGER NOT NULL,
    "itemsTotalIrr" INTEGER NOT NULL,
    "shippingProvider" "ShippingProvider",
    "shippingIrr" INTEGER,
    "shippingAddress" JSONB,
    "totalPaidIrr" INTEGER,
    "paidWithdrawableIrr" INTEGER,
    "paidPurchaseOnlyIrr" INTEGER,
    "designRejectReason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proofApprovedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "estimatedReadyAt" TIMESTAMP(3),
    "productionStartedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "shippingNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" "SetPetActor",
    "cancelReason" TEXT,
    "refundedIrr" INTEGER,
    "refundedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "set_pet_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "set_pet_items" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "garment" "SetPetGarment" NOT NULL,
    "size" "SetPetSize" NOT NULL,
    "colour" TEXT NOT NULL,
    "petId" UUID,
    "petName" TEXT,
    "petSpecies" "PetSpecies",

    CONSTRAINT "set_pet_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "set_pet_design_files" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "originalFilename" TEXT,
    "previewable" BOOLEAN NOT NULL DEFAULT false,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
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
    "designFileId" UUID,
    "scale" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "offsetX" DECIMAL(4,3) NOT NULL DEFAULT 0,
    "offsetY" DECIMAL(4,3) NOT NULL DEFAULT 0,
    "text" TEXT,
    "font" "SetPetFont",
    "textColour" TEXT,

    CONSTRAINT "set_pet_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "set_pet_proofs" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "status" "SetPetProofStatus" NOT NULL DEFAULT 'UPLOADING',
    "note" TEXT,
    "petPrintWidthCm" INTEGER,
    "petPrintHeightCm" INTEGER,
    "uploadedByAdminUserId" UUID NOT NULL,
    "sentAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "set_pet_proofs_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "set_pet_items_requestId_position_key" ON "set_pet_items"("requestId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "set_pet_design_files_objectKey_key" ON "set_pet_design_files"("objectKey");

-- CreateIndex
CREATE INDEX "set_pet_design_files_userId_createdAt_idx" ON "set_pet_design_files"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "set_pet_placements_designFileId_idx" ON "set_pet_placements"("designFileId");

-- CreateIndex
CREATE UNIQUE INDEX "set_pet_placements_requestId_zone_key" ON "set_pet_placements"("requestId", "zone");

-- CreateIndex
CREATE UNIQUE INDEX "set_pet_proofs_objectKey_key" ON "set_pet_proofs"("objectKey");

-- CreateIndex
CREATE INDEX "set_pet_proofs_requestId_createdAt_idx" ON "set_pet_proofs"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "set_pet_request_events_requestId_createdAt_idx" ON "set_pet_request_events"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "set_pet_drafts" ADD CONSTRAINT "set_pet_drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_pet_requests" ADD CONSTRAINT "set_pet_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_pet_requests" ADD CONSTRAINT "set_pet_requests_forPetId_fkey" FOREIGN KEY ("forPetId") REFERENCES "pets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_pet_items" ADD CONSTRAINT "set_pet_items_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "set_pet_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_pet_items" ADD CONSTRAINT "set_pet_items_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_pet_design_files" ADD CONSTRAINT "set_pet_design_files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_pet_placements" ADD CONSTRAINT "set_pet_placements_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "set_pet_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_pet_placements" ADD CONSTRAINT "set_pet_placements_designFileId_fkey" FOREIGN KEY ("designFileId") REFERENCES "set_pet_design_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_pet_proofs" ADD CONSTRAINT "set_pet_proofs_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "set_pet_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_pet_request_events" ADD CONSTRAINT "set_pet_request_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "set_pet_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

