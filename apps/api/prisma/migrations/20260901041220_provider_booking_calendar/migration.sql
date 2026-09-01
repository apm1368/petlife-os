-- Handoff 03: Find a Vet + Vet Booking Basics + Temporary Health Access +
-- Care Calendar Integration. Purely additive on top of the Handoff 02
-- migrations — no existing table is altered.
--
-- Raw SQL at the bottom of this file (not expressible in schema.prisma):
--   - two partial unique indexes on "bookings" that prevent the exact same
--     provider-location/provider-user/startAt slot from being confirmed
--     twice (BookingsService.confirm() also re-checks for any *overlapping*
--     active booking inside the same transaction — the DB constraint is the
--     last line of defense against a concurrent double-confirm race, not the
--     only check).
--   - a CHECK constraint that "endAt" > "startAt" on both "bookings" and
--     "care_calendar_events".

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('VET_CLINIC', 'VET_HOSPITAL', 'VETERINARIAN');

-- CreateEnum
CREATE TYPE "ProviderVerificationStatus" AS ENUM ('NOT_STARTED', 'SUBMITTED', 'NEEDS_INFORMATION', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProviderUserRole" AS ENUM ('OWNER', 'VET', 'STAFF');

-- CreateEnum
CREATE TYPE "ProviderServiceType" AS ENUM ('GENERAL_VET_VISIT', 'VACCINATION', 'FOLLOW_UP', 'CONSULTATION');

-- CreateEnum
CREATE TYPE "AvailabilityExceptionType" AS ENUM ('BLOCKED', 'AVAILABLE_OVERRIDE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('HOLD', 'PENDING_CONFIRMATION', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED_BY_USER', 'CANCELLED_BY_PROVIDER', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUND_PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "HealthAccessScopePreset" AS ENUM ('MINIMAL_VET_CONTEXT', 'HEALTH_BASICS', 'SELECTED_HEALTH_DATA');

-- CreateEnum
CREATE TYPE "CareCalendarEventType" AS ENUM ('VET_APPOINTMENT');

-- CreateEnum
CREATE TYPE "CareCalendarEventStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "provider_organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProviderType" NOT NULL,
    "verificationStatus" "ProviderVerificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "phone" TEXT,
    "email" TEXT,
    "description" TEXT,
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_locations" (
    "id" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "name" TEXT,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "countryCode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_users" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "role" "ProviderUserRole" NOT NULL DEFAULT 'VET',
    "displayTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_services" (
    "id" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "locationId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ProviderServiceType" NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "priceAmount" DECIMAL(10,2),
    "currency" TEXT,
    "supportsDog" BOOLEAN NOT NULL DEFAULT true,
    "supportsCat" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_availability_rules" (
    "id" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "providerUserId" UUID,
    "serviceId" UUID,
    "dayOfWeek" INTEGER NOT NULL,
    "startLocalTime" TEXT NOT NULL,
    "endLocalTime" TEXT NOT NULL,
    "effectiveFrom" DATE,
    "effectiveUntil" DATE,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_availability_exceptions" (
    "id" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "providerUserId" UUID,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "type" "AvailabilityExceptionType" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "providerLocationId" UUID NOT NULL,
    "providerUserId" UUID,
    "providerServiceId" UUID NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "bookingStatus" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "reasonForVisit" TEXT,
    "ownerNotes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_health_access" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "petAccessGrantId" UUID NOT NULL,
    "scopePreset" "HealthAccessScopePreset" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_health_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_calendar_events" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "sourceType" "CareCalendarEventType" NOT NULL,
    "sourceId" UUID NOT NULL,
    "type" "CareCalendarEventType" NOT NULL,
    "status" "CareCalendarEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "actionType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_organizations_verificationStatus_idx" ON "provider_organizations"("verificationStatus");

-- CreateIndex
CREATE INDEX "provider_locations_providerOrganizationId_idx" ON "provider_locations"("providerOrganizationId");

-- CreateIndex
CREATE INDEX "provider_locations_city_idx" ON "provider_locations"("city");

-- CreateIndex
CREATE INDEX "provider_users_providerOrganizationId_idx" ON "provider_users"("providerOrganizationId");

-- CreateIndex
CREATE INDEX "provider_users_userId_idx" ON "provider_users"("userId");

-- CreateIndex
CREATE INDEX "provider_services_providerOrganizationId_idx" ON "provider_services"("providerOrganizationId");

-- CreateIndex
CREATE INDEX "provider_services_type_idx" ON "provider_services"("type");

-- CreateIndex
CREATE INDEX "provider_availability_rules_providerOrganizationId_location_idx" ON "provider_availability_rules"("providerOrganizationId", "locationId");

-- CreateIndex
CREATE INDEX "provider_availability_exceptions_providerOrganizationId_loc_idx" ON "provider_availability_exceptions"("providerOrganizationId", "locationId");

-- CreateIndex
CREATE INDEX "provider_availability_exceptions_startAt_endAt_idx" ON "provider_availability_exceptions"("startAt", "endAt");

-- CreateIndex
CREATE INDEX "bookings_petId_idx" ON "bookings"("petId");

-- CreateIndex
CREATE INDEX "bookings_householdId_idx" ON "bookings"("householdId");

-- CreateIndex
CREATE INDEX "bookings_userId_idx" ON "bookings"("userId");

-- CreateIndex
CREATE INDEX "bookings_providerLocationId_startAt_idx" ON "bookings"("providerLocationId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "booking_health_access_bookingId_key" ON "booking_health_access"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_health_access_petAccessGrantId_key" ON "booking_health_access"("petAccessGrantId");

-- CreateIndex
CREATE INDEX "care_calendar_events_householdId_petId_idx" ON "care_calendar_events"("householdId", "petId");

-- CreateIndex
CREATE INDEX "care_calendar_events_startAt_idx" ON "care_calendar_events"("startAt");

-- CreateIndex
CREATE UNIQUE INDEX "care_calendar_events_sourceType_sourceId_key" ON "care_calendar_events"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "provider_locations" ADD CONSTRAINT "provider_locations_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_users" ADD CONSTRAINT "provider_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_users" ADD CONSTRAINT "provider_users_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_services" ADD CONSTRAINT "provider_services_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_services" ADD CONSTRAINT "provider_services_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "provider_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_availability_rules" ADD CONSTRAINT "provider_availability_rules_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_availability_rules" ADD CONSTRAINT "provider_availability_rules_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "provider_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_availability_rules" ADD CONSTRAINT "provider_availability_rules_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "provider_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_availability_rules" ADD CONSTRAINT "provider_availability_rules_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "provider_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_availability_exceptions" ADD CONSTRAINT "provider_availability_exceptions_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_availability_exceptions" ADD CONSTRAINT "provider_availability_exceptions_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "provider_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_availability_exceptions" ADD CONSTRAINT "provider_availability_exceptions_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "provider_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_providerLocationId_fkey" FOREIGN KEY ("providerLocationId") REFERENCES "provider_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "provider_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_providerServiceId_fkey" FOREIGN KEY ("providerServiceId") REFERENCES "provider_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_health_access" ADD CONSTRAINT "booking_health_access_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_health_access" ADD CONSTRAINT "booking_health_access_petAccessGrantId_fkey" FOREIGN KEY ("petAccessGrantId") REFERENCES "pet_access_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_calendar_events" ADD CONSTRAINT "care_calendar_events_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_calendar_events" ADD CONSTRAINT "care_calendar_events_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Raw SQL: constraints Prisma's schema DSL cannot express
-- ============================================================================

-- Prevent the exact same provider-user's slot at the same location/time from
-- ever being confirmed twice. NULLs are not distinct-safe for this purpose in
-- a plain unique index (Postgres treats every NULL as distinct from every
-- other NULL), so this is split into two partial indexes: one scoped to
-- bookings with an assigned provider user, one to bookings against a location
-- generally (no specific vet). Both exclude cancelled bookings, since a
-- cancelled slot must become bookable again.
CREATE UNIQUE INDEX "bookings_active_slot_with_provider_user_key"
  ON "bookings" ("providerLocationId", "providerUserId", "startAt")
  WHERE "providerUserId" IS NOT NULL
    AND "bookingStatus" NOT IN ('CANCELLED_BY_USER', 'CANCELLED_BY_PROVIDER');

CREATE UNIQUE INDEX "bookings_active_slot_no_provider_user_key"
  ON "bookings" ("providerLocationId", "startAt")
  WHERE "providerUserId" IS NULL
    AND "bookingStatus" NOT IN ('CANCELLED_BY_USER', 'CANCELLED_BY_PROVIDER');

-- Basic sanity constraints Prisma's DSL has no syntax for.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_end_after_start_check" CHECK ("endAt" > "startAt");

ALTER TABLE "care_calendar_events"
  ADD CONSTRAINT "care_calendar_events_end_after_start_check" CHECK ("endAt" > "startAt");
