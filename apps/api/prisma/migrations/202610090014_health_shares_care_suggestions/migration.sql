-- CreateEnum
CREATE TYPE "CareSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED');

-- CreateTable
CREATE TABLE "health_share_links" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "label" TEXT,
    "sections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "labResultIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clinicalVisitIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imagingStudyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_share_accesses" (
    "id" UUID NOT NULL,
    "linkId" UUID NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "health_share_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_suggestions" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "createdByProviderUserId" UUID,
    "clinicalVisitId" UUID,
    "bookingId" UUID,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "notes" TEXT,
    "suggestedDueAt" TIMESTAMP(3) NOT NULL,
    "recurrence" TEXT,
    "intervalDays" INTEGER,
    "status" "CareSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" UUID,
    "decidedAt" TIMESTAMP(3),
    "careReminderId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "health_share_links_tokenHash_key" ON "health_share_links"("tokenHash");

-- CreateIndex
CREATE INDEX "health_share_links_petId_createdAt_idx" ON "health_share_links"("petId", "createdAt");

-- CreateIndex
CREATE INDEX "health_share_accesses_linkId_accessedAt_idx" ON "health_share_accesses"("linkId", "accessedAt");

-- CreateIndex
CREATE INDEX "care_suggestions_petId_status_idx" ON "care_suggestions"("petId", "status");

-- AddForeignKey
ALTER TABLE "health_share_links" ADD CONSTRAINT "health_share_links_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_share_accesses" ADD CONSTRAINT "health_share_accesses_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "health_share_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_suggestions" ADD CONSTRAINT "care_suggestions_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

