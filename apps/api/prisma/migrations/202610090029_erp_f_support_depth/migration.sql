-- CreateEnum
CREATE TYPE "SupportLinkEntityType" AS ENUM ('BOOKING', 'TRAVEL_BOOKING', 'ORDER', 'PAYMENT_INTENT', 'REFUND', 'PROVIDER', 'SELLER', 'PET', 'HOUSEHOLD');

-- CreateEnum
CREATE TYPE "SupportAttachmentVisibility" AS ENUM ('INTERNAL', 'SHARED');



-- AlterTable
ALTER TABLE "disputes" ADD COLUMN     "refundApprovalId" UUID;

-- AlterTable
ALTER TABLE "support_cases" ADD COLUMN     "firstAssignedAt" TIMESTAMP(3),
ADD COLUMN     "reopenCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "support_case_links" (
    "id" UUID NOT NULL,
    "supportCaseId" UUID NOT NULL,
    "entityType" "SupportLinkEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "createdByAdminId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_case_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_case_attachments" (
    "id" UUID NOT NULL,
    "supportCaseId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "visibility" "SupportAttachmentVisibility" NOT NULL,
    "uploadedByUserId" UUID,
    "uploadedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_case_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_case_links_entityType_entityId_idx" ON "support_case_links"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "support_case_links_supportCaseId_entityType_entityId_key" ON "support_case_links"("supportCaseId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "support_case_attachments_objectKey_key" ON "support_case_attachments"("objectKey");

-- CreateIndex
CREATE INDEX "support_case_attachments_supportCaseId_idx" ON "support_case_attachments"("supportCaseId");


-- Backfill: cases that already have an assignee count as assigned at creation (best available evidence).
UPDATE "support_cases" SET "firstAssignedAt" = "createdAt" WHERE "assignedAdminId" IS NOT NULL AND "firstAssignedAt" IS NULL;
