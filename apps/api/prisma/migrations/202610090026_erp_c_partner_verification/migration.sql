-- CreateEnum
CREATE TYPE "PartnerSubjectType" AS ENUM ('PROVIDER', 'SELLER');

-- CreateEnum
CREATE TYPE "PartnerDocumentKind" AS ENUM ('LICENSE', 'IDENTITY', 'BUSINESS_REGISTRATION', 'BANK_INFO', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnerDocumentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');



-- AlterTable
ALTER TABLE "provider_organizations" ADD COLUMN     "verificationNote" TEXT,
ADD COLUMN     "verificationSubmittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "seller_organizations" ADD COLUMN     "verificationNote" TEXT,
ADD COLUMN     "verificationSubmittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "partner_verification_documents" (
    "id" UUID NOT NULL,
    "subjectType" "PartnerSubjectType" NOT NULL,
    "subjectId" UUID NOT NULL,
    "kind" "PartnerDocumentKind" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "status" "PartnerDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "uploadedByUserId" UUID NOT NULL,
    "reviewedByAdminId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "expiryAlertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_verification_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_entitlement_overrides" (
    "id" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "boolValue" BOOLEAN,
    "limitValue" INTEGER,
    "unlimited" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "createdByAdminId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "revokedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_entitlement_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_verification_documents_objectKey_key" ON "partner_verification_documents"("objectKey");

-- CreateIndex
CREATE INDEX "partner_verification_documents_subjectType_subjectId_idx" ON "partner_verification_documents"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "partner_verification_documents_status_expiresAt_idx" ON "partner_verification_documents"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "clinic_entitlement_overrides_providerOrganizationId_active_idx" ON "clinic_entitlement_overrides"("providerOrganizationId", "active");

