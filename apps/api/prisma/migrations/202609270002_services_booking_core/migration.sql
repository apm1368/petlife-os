-- CreateExtension

-- CreateEnum
CREATE TYPE "BookingMode" AS ENUM ('INSTANT', 'REQUEST');

-- CreateEnum
CREATE TYPE "BookingPaymentMode" AS ENUM ('NONE', 'PAY_AT_PROVIDER', 'FULL_PREPAYMENT', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "BookingActorType" AS ENUM ('USER', 'PROVIDER', 'SYSTEM', 'ADMIN');

-- CreateEnum
CREATE TYPE "ProviderResourceType" AS ENUM ('EXAM_ROOM', 'GROOMING_STATION', 'IMAGING_DEVICE', 'VEHICLE', 'TRAINING_ROOM', 'OTHER');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('ACTIVE', 'NOTIFIED', 'BOOKED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProviderReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.



-- AlterEnum

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.



-- AlterEnum

-- DropIndex

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "bookingMode" "BookingMode" NOT NULL DEFAULT 'INSTANT',
ADD COLUMN     "bookingNumber" TEXT,
ADD COLUMN     "cancellationPolicySnapshot" TEXT,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "depositAmount" DECIMAL(12,2),
ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "freeCancellationHours" INTEGER,
ADD COLUMN     "lateCancellationRefundPercent" INTEGER,
ADD COLUMN     "paymentIntentId" UUID,
ADD COLUMN     "paymentMode" "BookingPaymentMode" NOT NULL DEFAULT 'PAY_AT_PROVIDER',
ADD COLUMN     "preparationSnapshot" TEXT,
ADD COLUMN     "priceAmount" DECIMAL(12,2),
ADD COLUMN     "rejectedReason" TEXT,
ADD COLUMN     "requestExpiresAt" TIMESTAMP(3),
ADD COLUMN     "rescheduledFromBookingId" UUID,
ADD COLUMN     "resourceId" UUID,
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "serviceNameSnapshot" TEXT,
ADD COLUMN     "variantId" UUID,
ADD COLUMN     "variantNameSnapshot" TEXT;

-- AlterTable
ALTER TABLE "provider_organizations" ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "faqs" JSONB,
ADD COLUMN     "galleryUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "policiesText" TEXT,
ADD COLUMN     "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "provider_services" ADD COLUMN     "bookingMode" "BookingMode" NOT NULL DEFAULT 'INSTANT',
ADD COLUMN     "cancellationPolicy" TEXT,
ADD COLUMN     "depositAmount" DECIMAL(12,2),
ADD COLUMN     "freeCancellationHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "lateCancellationRefundPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxPetsPerBooking" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "paymentMode" "BookingPaymentMode" NOT NULL DEFAULT 'PAY_AT_PROVIDER',
ADD COLUMN     "preparationNotes" TEXT,
ADD COLUMN     "requestTtlHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "requiredResourceType" "ProviderResourceType";

-- AlterTable
ALTER TABLE "provider_users" ADD COLUMN     "isBookable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "publicBio" TEXT;

-- CreateTable
CREATE TABLE "provider_service_variants" (
    "id" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceAmount" DECIMAL(12,2),
    "durationMinutes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_service_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_user_services" (
    "providerUserId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_user_services_pkey" PRIMARY KEY ("providerUserId","serviceId")
);

-- CreateTable
CREATE TABLE "provider_resources" (
    "id" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProviderResourceType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_pets" (
    "bookingId" UUID NOT NULL,
    "petId" UUID NOT NULL,

    CONSTRAINT "booking_pets_pkey" PRIMARY KEY ("bookingId","petId")
);

-- CreateTable
CREATE TABLE "booking_status_events" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus" NOT NULL,
    "actorType" "BookingActorType" NOT NULL,
    "actorId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_waitlist_entries" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "variantId" UUID,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'ACTIVE',
    "notifiedAt" TIMESTAMP(3),
    "bookedBookingId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_reviews" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "status" "ProviderReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "hiddenReason" TEXT,
    "providerResponse" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_favorites" (
    "userId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_favorites_pkey" PRIMARY KEY ("userId","providerOrganizationId")
);

-- CreateIndex
CREATE INDEX "provider_service_variants_serviceId_idx" ON "provider_service_variants"("serviceId");

-- CreateIndex
CREATE INDEX "provider_user_services_serviceId_idx" ON "provider_user_services"("serviceId");

-- CreateIndex
CREATE INDEX "provider_resources_providerOrganizationId_locationId_type_idx" ON "provider_resources"("providerOrganizationId", "locationId", "type");

-- CreateIndex
CREATE INDEX "booking_pets_petId_idx" ON "booking_pets"("petId");

-- CreateIndex
CREATE INDEX "booking_status_events_bookingId_createdAt_idx" ON "booking_status_events"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "booking_waitlist_entries_providerOrganizationId_serviceId_s_idx" ON "booking_waitlist_entries"("providerOrganizationId", "serviceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "booking_waitlist_entries_userId_status_idx" ON "booking_waitlist_entries"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "provider_reviews_bookingId_key" ON "provider_reviews"("bookingId");

-- CreateIndex
CREATE INDEX "provider_reviews_providerOrganizationId_status_createdAt_idx" ON "provider_reviews"("providerOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_bookingNumber_key" ON "bookings"("bookingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_rescheduledFromBookingId_key" ON "bookings"("rescheduledFromBookingId");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "provider_service_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "provider_resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rescheduledFromBookingId_fkey" FOREIGN KEY ("rescheduledFromBookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_service_variants" ADD CONSTRAINT "provider_service_variants_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "provider_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_user_services" ADD CONSTRAINT "provider_user_services_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "provider_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_user_services" ADD CONSTRAINT "provider_user_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "provider_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_resources" ADD CONSTRAINT "provider_resources_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_resources" ADD CONSTRAINT "provider_resources_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "provider_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_pets" ADD CONSTRAINT "booking_pets_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_pets" ADD CONSTRAINT "booking_pets_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_events" ADD CONSTRAINT "booking_status_events_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_waitlist_entries" ADD CONSTRAINT "booking_waitlist_entries_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_waitlist_entries" ADD CONSTRAINT "booking_waitlist_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_waitlist_entries" ADD CONSTRAINT "booking_waitlist_entries_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_waitlist_entries" ADD CONSTRAINT "booking_waitlist_entries_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_waitlist_entries" ADD CONSTRAINT "booking_waitlist_entries_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "provider_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_waitlist_entries" ADD CONSTRAINT "booking_waitlist_entries_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "provider_service_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_waitlist_entries" ADD CONSTRAINT "booking_waitlist_entries_bookedBookingId_fkey" FOREIGN KEY ("bookedBookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_reviews" ADD CONSTRAINT "provider_reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_reviews" ADD CONSTRAINT "provider_reviews_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_reviews" ADD CONSTRAINT "provider_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_favorites" ADD CONSTRAINT "provider_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_favorites" ADD CONSTRAINT "provider_favorites_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Batch 3 integrity rules Prisma's DSL cannot express.
-- ---------------------------------------------------------------------------

-- Terminal states no longer occupy capacity. Recreate the Handoff 03 exact-slot indexes so
-- REJECTED/EXPIRED bookings free their slot like cancelled ones.
DROP INDEX IF EXISTS "bookings_active_slot_with_provider_user_key";
DROP INDEX IF EXISTS "bookings_active_slot_no_provider_user_key";
CREATE UNIQUE INDEX "bookings_active_slot_with_provider_user_key"
  ON "bookings" ("providerLocationId", "providerUserId", "startAt")
  WHERE "providerUserId" IS NOT NULL
    AND "bookingStatus" NOT IN ('CANCELLED_BY_USER', 'CANCELLED_BY_PROVIDER', 'REJECTED', 'EXPIRED', 'RESCHEDULED');
CREATE UNIQUE INDEX "bookings_active_slot_no_provider_user_key"
  ON "bookings" ("providerLocationId", "startAt")
  WHERE "providerUserId" IS NULL
    AND "bookingStatus" NOT IN ('CANCELLED_BY_USER', 'CANCELLED_BY_PROVIDER', 'REJECTED', 'EXPIRED', 'RESCHEDULED');

ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_no_overlap_range_categories";
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap_range_categories"
  EXCLUDE USING gist ("providerLocationId" WITH =, tsrange("startAt", "endAt") WITH &&)
  WHERE ("category" IN ('SITTING', 'BOARDING') AND "bookingStatus" NOT IN ('CANCELLED_BY_USER', 'CANCELLED_BY_PROVIDER', 'REJECTED', 'EXPIRED', 'RESCHEDULED'));

-- Variants have different durations, so exact-start uniqueness is not enough: one staff member
-- can never hold two overlapping live bookings, whatever their start times.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap_provider_user"
  EXCLUDE USING gist ("providerUserId" WITH =, tsrange("startAt", "endAt") WITH &&)
  WHERE ("providerUserId" IS NOT NULL AND "category" NOT IN ('SITTING', 'BOARDING')
         AND "bookingStatus" NOT IN ('CANCELLED_BY_USER', 'CANCELLED_BY_PROVIDER', 'REJECTED', 'EXPIRED', 'RESCHEDULED'));

-- A room/station/device/vehicle is also single-occupancy.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap_resource"
  EXCLUDE USING gist ("resourceId" WITH =, tsrange("startAt", "endAt") WITH &&)
  WHERE ("resourceId" IS NOT NULL
         AND "bookingStatus" NOT IN ('CANCELLED_BY_USER', 'CANCELLED_BY_PROVIDER', 'REJECTED', 'EXPIRED', 'RESCHEDULED'));

ALTER TABLE "provider_reviews" ADD CONSTRAINT "provider_reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "provider_services" ADD CONSTRAINT "provider_services_refund_percent_range" CHECK ("lateCancellationRefundPercent" BETWEEN 0 AND 100);
ALTER TABLE "provider_services" ADD CONSTRAINT "provider_services_max_pets_range" CHECK ("maxPetsPerBooking" BETWEEN 1 AND 10);
ALTER TABLE "provider_services" ADD CONSTRAINT "provider_services_request_ttl_range" CHECK ("requestTtlHours" BETWEEN 1 AND 168);
ALTER TABLE "provider_service_variants" ADD CONSTRAINT "provider_service_variants_duration_positive" CHECK ("durationMinutes" > 0);
ALTER TABLE "booking_waitlist_entries" ADD CONSTRAINT "booking_waitlist_window_valid" CHECK ("windowEnd" > "windowStart");

-- Human-readable booking number (PL-B-000001), assigned by the application from this sequence.
CREATE SEQUENCE IF NOT EXISTS "booking_number_seq" START 1;
