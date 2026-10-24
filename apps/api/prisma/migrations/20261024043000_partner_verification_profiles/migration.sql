ALTER TYPE "PartnerDocumentKind" ADD VALUE 'NATIONAL_ID_CARD';
ALTER TYPE "PartnerDocumentKind" ADD VALUE 'BUSINESS_LICENSE';
ALTER TYPE "PartnerDocumentKind" ADD VALUE 'ENAMAD';

CREATE TABLE "partner_verification_profiles" (
    "id" UUID NOT NULL,
    "subjectType" "PartnerSubjectType" NOT NULL,
    "subjectId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "landline" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "enamadId" TEXT,
    "mobile" TEXT NOT NULL,
    "mobileVerifiedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "partner_verification_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "partner_verification_profiles_subjectType_subjectId_key" ON "partner_verification_profiles"("subjectType", "subjectId");
