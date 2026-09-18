-- CreateEnum
CREATE TYPE "SupportNeedCategory" AS ENUM ('FOOD', 'MEDICINE', 'VETERINARY_CARE', 'TEMPORARY_HOME', 'FOSTER', 'TRANSPORT', 'VOLUNTEER', 'EQUIPMENT', 'FINANCIAL', 'SHELTER_SUPPLIES', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportNeedUrgency" AS ENUM ('NORMAL', 'IMPORTANT', 'URGENT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SupportNeedStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'FULFILLED', 'CLOSED', 'EXPIRED', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "SupportNeedContactMode" AS ENUM ('OFFER_HELP', 'DONATE', 'BOTH');

-- CreateEnum
CREATE TYPE "HelpOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'COMPLETED', 'CANCELLED');

-- NOTE: prisma migrate diff's draft also included
-- `DROP INDEX "pet_friendly_places_location_gist_idx"` — the same false
-- positive documented in 20260911214934_memories_diary_enhancement. That
-- index is a raw-SQL `USING GIST` spatial index from Handoff 19 that
-- schema.prisma cannot model, so every shadow-DB diff sees it as drift.
-- It must never be dropped; PetFriendlyPlace nearby search depends on it.

-- CreateTable
CREATE TABLE "support_need_listings" (
    "id" UUID NOT NULL,
    "creatorUserId" UUID,
    "organizationId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "SupportNeedCategory" NOT NULL,
    "urgency" "SupportNeedUrgency" NOT NULL DEFAULT 'NORMAL',
    "status" "SupportNeedStatus" NOT NULL DEFAULT 'DRAFT',
    "province" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "neighborhood" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "imageObjectKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "neededQuantity" INTEGER,
    "fulfilledQuantity" INTEGER NOT NULL DEFAULT 0,
    "quantityUnit" TEXT,
    "campaignId" UUID,
    "contactMode" "SupportNeedContactMode" NOT NULL DEFAULT 'OFFER_HELP',
    "animalType" TEXT,
    "reviewedByAdminId" UUID,
    "reviewNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_need_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_offers" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "helperUserId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "helpType" "SupportNeedCategory" NOT NULL,
    "quantity" INTEGER,
    "status" "HelpOfferStatus" NOT NULL DEFAULT 'PENDING',
    "fulfilledQuantity" INTEGER,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_need_listings_status_publishedAt_idx" ON "support_need_listings"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "support_need_listings_category_idx" ON "support_need_listings"("category");

-- CreateIndex
CREATE INDEX "support_need_listings_province_city_idx" ON "support_need_listings"("province", "city");

-- CreateIndex
CREATE INDEX "support_need_listings_creatorUserId_idx" ON "support_need_listings"("creatorUserId");

-- CreateIndex
CREATE INDEX "support_need_listings_organizationId_idx" ON "support_need_listings"("organizationId");

-- CreateIndex
CREATE INDEX "help_offers_listingId_status_idx" ON "help_offers"("listingId", "status");

-- CreateIndex
CREATE INDEX "help_offers_helperUserId_idx" ON "help_offers"("helperUserId");

-- AddForeignKey
ALTER TABLE "support_need_listings" ADD CONSTRAINT "support_need_listings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "animal_support_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_need_listings" ADD CONSTRAINT "support_need_listings_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "support_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_offers" ADD CONSTRAINT "help_offers_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "support_need_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
