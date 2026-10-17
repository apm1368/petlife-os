-- CreateEnum
CREATE TYPE "TravelCancellationType" AS ENUM ('FREE_UNTIL', 'PARTIAL', 'NON_REFUNDABLE');

-- CreateEnum
CREATE TYPE "TravelPaymentTiming" AS ENUM ('PAY_NOW', 'DEPOSIT', 'PAY_AT_PROPERTY');

-- CreateEnum
CREATE TYPE "TravelReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "TravelRequirementRuleStatus" AS ENUM ('ACTIVE', 'NEEDS_REVIEW', 'RETIRED');

-- CreateEnum
CREATE TYPE "InsurerRole" AS ENUM ('OWNER', 'UNDERWRITING', 'VIEWER');

-- CreateEnum
CREATE TYPE "PlaceReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- AlterEnum
ALTER TYPE "InsuranceApplicationStatus" ADD VALUE 'NEEDS_INFORMATION';

-- AlterEnum
ALTER TYPE "ProviderType" ADD VALUE 'TRAVEL_ACCOMMODATION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TravelBookingStatus" ADD VALUE 'HELD';
ALTER TYPE "TravelBookingStatus" ADD VALUE 'NO_SHOW';
ALTER TYPE "TravelBookingStatus" ADD VALUE 'MODIFIED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TravelListingType" ADD VALUE 'HOTEL';
ALTER TYPE "TravelListingType" ADD VALUE 'ECO_LODGE';
ALTER TYPE "TravelListingType" ADD VALUE 'GUESTHOUSE';
ALTER TYPE "TravelListingType" ADD VALUE 'RESORT';
ALTER TYPE "TravelListingType" ADD VALUE 'PET_HOTEL';


-- AlterTable
ALTER TABLE "insurance_applications" ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "consentText" TEXT,
ADD COLUMN     "externalReference" TEXT,
ADD COLUMN     "insurerMessage" TEXT;

-- AlterTable
ALTER TABLE "pet_friendly_places" ADD COLUMN     "leashRequired" BOOLEAN,
ADD COLUMN     "openingHours" JSONB,
ADD COLUMN     "petArea" BOOLEAN,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "waterAvailable" BOOLEAN;

-- AlterTable
ALTER TABLE "travel_bookings" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "discountAmountIrr" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "holdExpiresAt" TIMESTAMP(3),
ADD COLUMN     "modifiedFromBookingId" UUID,
ADD COLUMN     "noShowAt" TIMESTAMP(3),
ADD COLUMN     "payNowAmountIrr" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentIntentId" UUID,
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "petPolicySnapshot" JSONB,
ADD COLUMN     "priceBreakdownSnapshot" JSONB,
ADD COLUMN     "ratePlanId" UUID,
ADD COLUMN     "ratePlanSnapshot" JSONB,
ADD COLUMN     "refundAmountIrr" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requestExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "travel_inventory_units" ADD COLUMN     "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bedInfo" TEXT,
ADD COLUMN     "maxPets" INTEGER,
ADD COLUMN     "petNotes" TEXT,
ADD COLUMN     "sizeSqm" INTEGER;

-- AlterTable
ALTER TABLE "travel_listings" ADD COLUMN     "checkInFrom" TEXT,
ADD COLUMN     "checkOutUntil" TEXT,
ADD COLUMN     "houseRules" TEXT,
ADD COLUMN     "moderationNote" TEXT,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByAdminId" UUID,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "travel_rate_plans" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "priceModifierPercent" INTEGER NOT NULL DEFAULT 0,
    "cancellationType" "TravelCancellationType" NOT NULL DEFAULT 'FREE_UNTIL',
    "freeCancellationDays" INTEGER,
    "lateRefundPercent" INTEGER,
    "paymentTiming" "TravelPaymentTiming" NOT NULL DEFAULT 'PAY_NOW',
    "depositPercent" INTEGER,
    "includesBreakfast" BOOLEAN NOT NULL DEFAULT false,
    "includedItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minNights" INTEGER,
    "activeFrom" TIMESTAMP(3),
    "activeUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_rate_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_media" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "unitId" UUID,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_booking_events" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "fromStatus" "TravelBookingStatus",
    "toStatus" "TravelBookingStatus" NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_reviews" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "overall" INTEGER NOT NULL,
    "petFriendliness" INTEGER,
    "cleanliness" INTEGER,
    "location" INTEGER,
    "body" TEXT,
    "status" "TravelReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "hiddenReason" TEXT,
    "providerResponse" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_listing_favorites" (
    "userId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_listing_favorites_pkey" PRIMARY KEY ("userId","listingId")
);

-- CreateTable
CREATE TABLE "travel_booking_document_shares" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "medicalDocumentId" UUID NOT NULL,
    "sharedByUserId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_booking_document_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_requirement_rules" (
    "id" UUID NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT,
    "requirementType" "TravelRequirementType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "species" "PetSpecies"[] DEFAULT ARRAY[]::"PetSpecies"[],
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "status" "TravelRequirementRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "updatedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_requirement_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurer_memberships" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "InsurerRole" NOT NULL DEFAULT 'UNDERWRITING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurer_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_application_events" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "fromStatus" "InsuranceApplicationStatus",
    "toStatus" "InsuranceApplicationStatus" NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_application_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_reports" (
    "id" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "PlaceReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "place_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "travel_rate_plans_unitId_idx" ON "travel_rate_plans"("unitId");

-- CreateIndex
CREATE INDEX "travel_media_listingId_sortOrder_idx" ON "travel_media"("listingId", "sortOrder");

-- CreateIndex
CREATE INDEX "travel_booking_events_bookingId_createdAt_idx" ON "travel_booking_events"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "travel_reviews_bookingId_key" ON "travel_reviews"("bookingId");

-- CreateIndex
CREATE INDEX "travel_reviews_listingId_status_createdAt_idx" ON "travel_reviews"("listingId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "travel_booking_document_shares_bookingId_medicalDocumentId_key" ON "travel_booking_document_shares"("bookingId", "medicalDocumentId");

-- CreateIndex
CREATE INDEX "travel_requirement_rules_country_status_idx" ON "travel_requirement_rules"("country", "status");

-- CreateIndex
CREATE INDEX "insurer_memberships_userId_idx" ON "insurer_memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "insurer_memberships_providerId_userId_key" ON "insurer_memberships"("providerId", "userId");

-- CreateIndex
CREATE INDEX "insurance_application_events_applicationId_createdAt_idx" ON "insurance_application_events"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "place_reports_status_createdAt_idx" ON "place_reports"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "travel_bookings_modifiedFromBookingId_key" ON "travel_bookings"("modifiedFromBookingId");

-- AddForeignKey
ALTER TABLE "travel_bookings" ADD CONSTRAINT "travel_bookings_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "travel_rate_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_rate_plans" ADD CONSTRAINT "travel_rate_plans_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "travel_inventory_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_media" ADD CONSTRAINT "travel_media_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "travel_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_media" ADD CONSTRAINT "travel_media_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "travel_inventory_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_booking_events" ADD CONSTRAINT "travel_booking_events_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "travel_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_reviews" ADD CONSTRAINT "travel_reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "travel_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_reviews" ADD CONSTRAINT "travel_reviews_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "travel_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_listing_favorites" ADD CONSTRAINT "travel_listing_favorites_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "travel_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_booking_document_shares" ADD CONSTRAINT "travel_booking_document_shares_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "travel_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_booking_document_shares" ADD CONSTRAINT "travel_booking_document_shares_medicalDocumentId_fkey" FOREIGN KEY ("medicalDocumentId") REFERENCES "medical_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurer_memberships" ADD CONSTRAINT "insurer_memberships_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "insurance_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_application_events" ADD CONSTRAINT "insurance_application_events_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "insurance_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_reports" ADD CONSTRAINT "place_reports_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "pet_friendly_places"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Batch 5 integrity checks
ALTER TABLE "travel_rate_plans" ADD CONSTRAINT "travel_rate_plans_modifier_range" CHECK ("priceModifierPercent" BETWEEN -90 AND 200);
ALTER TABLE "travel_rate_plans" ADD CONSTRAINT "travel_rate_plans_deposit_range" CHECK ("depositPercent" IS NULL OR "depositPercent" BETWEEN 1 AND 100);
ALTER TABLE "travel_rate_plans" ADD CONSTRAINT "travel_rate_plans_late_refund_range" CHECK ("lateRefundPercent" IS NULL OR "lateRefundPercent" BETWEEN 0 AND 100);
ALTER TABLE "travel_rate_plans" ADD CONSTRAINT "travel_rate_plans_free_days_range" CHECK ("freeCancellationDays" IS NULL OR "freeCancellationDays" BETWEEN 0 AND 365);
ALTER TABLE "travel_rate_plans" ADD CONSTRAINT "travel_rate_plans_min_nights" CHECK ("minNights" IS NULL OR "minNights" BETWEEN 1 AND 60);
ALTER TABLE "travel_reviews" ADD CONSTRAINT "travel_reviews_scores_range" CHECK (
  "overall" BETWEEN 1 AND 5
  AND ("petFriendliness" IS NULL OR "petFriendliness" BETWEEN 1 AND 5)
  AND ("cleanliness" IS NULL OR "cleanliness" BETWEEN 1 AND 5)
  AND ("location" IS NULL OR "location" BETWEEN 1 AND 5));
ALTER TABLE "travel_bookings" ADD CONSTRAINT "travel_bookings_amounts_nonnegative" CHECK (
  "discountAmountIrr" >= 0 AND "payNowAmountIrr" >= 0 AND "refundAmountIrr" >= 0 AND "refundAmountIrr" <= "totalAmountIrr");
ALTER TABLE "travel_booking_document_shares" ADD CONSTRAINT "travel_document_share_window" CHECK ("expiresAt" > "createdAt");
