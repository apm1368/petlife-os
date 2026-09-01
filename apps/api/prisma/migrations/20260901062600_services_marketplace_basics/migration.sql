-- Handoff 04: Services Marketplace Basics. Extends the Handoff 03
-- provider/booking engine to Grooming/Training/Walking/Sitting/Boarding/Pet
-- Taxi rather than introducing a second provider or booking system.
--
-- This migration is hand-edited from the raw `prisma migrate diff` output
-- (safe to do non-interactively) for two reasons:
--   1. Two renames — HealthAccessScopePreset -> PetAccessScopePreset, and
--      BookingHealthAccess -> BookingPetAccess — must be true SQL RENAMEs,
--      not Prisma's default drop-and-recreate, to preserve every existing
--      Handoff 03 vet-booking access grant with zero data loss.
--   2. Two new required columns (`bookings.category`/`bookings.locationMode`,
--      `provider_services.category`) need a backfill default for any
--      already-existing rows (all Handoff 01-03 data is vet/AT_PROVIDER by
--      construction) before the column can be made NOT NULL with no
--      permanent default, matching schema.prisma exactly.
--
-- Also adds a real Postgres-level EXCLUDE constraint (via btree_gist) that
-- prevents two *overlapping* SITTING/BOARDING bookings at the same provider
-- location — the existing exact-startAt partial unique indexes from the
-- Handoff 03 migration only catch identical-start double-bookings, which is
-- sufficient for fixed-length slot categories (VET/GROOMING/TRAINING/
-- WALKING/PET_TAXI) but not for multi-day date-range bookings where two
-- different requested ranges can still overlap. See BookingsService for the
-- accompanying application-level overlap check (defense in depth, same
-- precedent as the Handoff 03 slot holds).

-- ============================================================================
-- New enums
-- ============================================================================

CREATE TYPE "ServiceCategory" AS ENUM ('VET', 'GROOMING', 'TRAINING', 'WALKING', 'SITTING', 'BOARDING', 'PET_TAXI');

CREATE TYPE "LocationMode" AS ENUM ('AT_PROVIDER', 'AT_CUSTOMER', 'MOBILE', 'TRANSPORT');

CREATE TYPE "BookingSeriesFrequency" AS ENUM ('ONE_TIME', 'WEEKLY');

CREATE TYPE "BookingSeriesStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED');

-- ============================================================================
-- Enum renames + additive values (preserves existing data — see header)
-- ============================================================================

ALTER TYPE "HealthAccessScopePreset" RENAME TO "PetAccessScopePreset";
ALTER TYPE "PetAccessScopePreset" ADD VALUE 'GROOMING_BASIC';
ALTER TYPE "PetAccessScopePreset" ADD VALUE 'TRAINING_BASIC';
ALTER TYPE "PetAccessScopePreset" ADD VALUE 'WALKING_BASIC';
ALTER TYPE "PetAccessScopePreset" ADD VALUE 'SITTING_BASIC';
ALTER TYPE "PetAccessScopePreset" ADD VALUE 'BOARDING_BASIC';
ALTER TYPE "PetAccessScopePreset" ADD VALUE 'TAXI_BASIC';

ALTER TYPE "CareCalendarEventType" ADD VALUE 'GROOMING_APPOINTMENT';
ALTER TYPE "CareCalendarEventType" ADD VALUE 'TRAINING_SESSION';
ALTER TYPE "CareCalendarEventType" ADD VALUE 'WALK';
ALTER TYPE "CareCalendarEventType" ADD VALUE 'SITTING';
ALTER TYPE "CareCalendarEventType" ADD VALUE 'BOARDING';
ALTER TYPE "CareCalendarEventType" ADD VALUE 'PET_TAXI';

ALTER TYPE "ProviderServiceType" ADD VALUE 'GROOMING_SESSION';
ALTER TYPE "ProviderServiceType" ADD VALUE 'TRAINING_SESSION';
ALTER TYPE "ProviderServiceType" ADD VALUE 'DOG_WALK';
ALTER TYPE "ProviderServiceType" ADD VALUE 'PET_SITTING';
ALTER TYPE "ProviderServiceType" ADD VALUE 'BOARDING_STAY';
ALTER TYPE "ProviderServiceType" ADD VALUE 'PET_TAXI_RIDE';

ALTER TYPE "ProviderType" ADD VALUE 'GROOMER';
ALTER TYPE "ProviderType" ADD VALUE 'TRAINER';
ALTER TYPE "ProviderType" ADD VALUE 'WALKER';
ALTER TYPE "ProviderType" ADD VALUE 'SITTER';
ALTER TYPE "ProviderType" ADD VALUE 'BOARDING';
ALTER TYPE "ProviderType" ADD VALUE 'PET_TAXI';
ALTER TYPE "ProviderType" ADD VALUE 'MULTI_SERVICE_PROVIDER';

-- ============================================================================
-- provider_services: new columns
-- ============================================================================

ALTER TABLE "provider_services"
  ADD COLUMN "category" "ServiceCategory" NOT NULL DEFAULT 'VET',
  ADD COLUMN "locationMode" "LocationMode" NOT NULL DEFAULT 'AT_PROVIDER',
  ADD COLUMN "minAgeMonths" INTEGER,
  ADD COLUMN "maxAgeMonths" INTEGER,
  ADD COLUMN "minWeightKg" DECIMAL(6,2),
  ADD COLUMN "maxWeightKg" DECIMAL(6,2),
  ADD COLUMN "requiresCareProfile" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requiresHealthBasics" BOOLEAN NOT NULL DEFAULT false;

-- Every pre-Handoff-04 service is a vet service — the DEFAULT above already
-- backfills existing rows correctly. Drop it afterward so schema.prisma's
-- lack of a `category` @default is honored: every future insert must state
-- one explicitly (the application always does).
ALTER TABLE "provider_services" ALTER COLUMN "category" DROP DEFAULT;

-- ============================================================================
-- customer_addresses (new)
-- ============================================================================

CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "label" TEXT,
    "recipient" TEXT,
    "phone" TEXT,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "countryCode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_addresses_householdId_idx" ON "customer_addresses"("householdId");

ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- booking_series (new)
-- ============================================================================

CREATE TABLE "booking_series" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "providerServiceId" UUID NOT NULL,
    "frequency" "BookingSeriesFrequency" NOT NULL,
    "status" "BookingSeriesStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_series_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_series_householdId_idx" ON "booking_series"("householdId");
CREATE INDEX "booking_series_petId_idx" ON "booking_series"("petId");

ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_providerServiceId_fkey" FOREIGN KEY ("providerServiceId") REFERENCES "provider_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- bookings: new columns
-- ============================================================================

ALTER TABLE "bookings"
  ADD COLUMN "category" "ServiceCategory" NOT NULL DEFAULT 'VET',
  ADD COLUMN "locationMode" "LocationMode" NOT NULL DEFAULT 'AT_PROVIDER',
  ADD COLUMN "customerAddressId" UUID,
  ADD COLUMN "dropoffAddressId" UUID,
  ADD COLUMN "bookingSeriesId" UUID;

-- Same backfill-then-drop-default reasoning as provider_services.category above.
ALTER TABLE "bookings" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "bookings" ALTER COLUMN "locationMode" DROP DEFAULT;

CREATE INDEX "bookings_bookingSeriesId_idx" ON "bookings"("bookingSeriesId");
CREATE INDEX "provider_services_category_idx" ON "provider_services"("category");

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customerAddressId_fkey" FOREIGN KEY ("customerAddressId") REFERENCES "customer_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_dropoffAddressId_fkey" FOREIGN KEY ("dropoffAddressId") REFERENCES "customer_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_bookingSeriesId_fkey" FOREIGN KEY ("bookingSeriesId") REFERENCES "booking_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- booking_health_access -> booking_pet_access (RENAME, not drop+recreate —
-- preserves every existing Handoff 03 vet-booking access-grant link)
-- ============================================================================

ALTER TABLE "booking_health_access" RENAME TO "booking_pet_access";
ALTER TABLE "booking_pet_access" RENAME CONSTRAINT "booking_health_access_pkey" TO "booking_pet_access_pkey";
ALTER TABLE "booking_pet_access" RENAME CONSTRAINT "booking_health_access_bookingId_fkey" TO "booking_pet_access_bookingId_fkey";
ALTER TABLE "booking_pet_access" RENAME CONSTRAINT "booking_health_access_petAccessGrantId_fkey" TO "booking_pet_access_petAccessGrantId_fkey";
ALTER INDEX "booking_health_access_bookingId_key" RENAME TO "booking_pet_access_bookingId_key";
ALTER INDEX "booking_health_access_petAccessGrantId_key" RENAME TO "booking_pet_access_petAccessGrantId_key";

-- ============================================================================
-- Raw SQL: constraints Prisma's schema DSL cannot express
-- ============================================================================

-- Enables the GiST exclusion constraint below (range-overlap checks need a
-- GiST-indexable equality operator class for the plain UUID column).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevents two overlapping SITTING/BOARDING bookings at the same provider
-- location — see the header comment. Scoped to just those two categories via
-- the WHERE clause since fixed-length-slot categories are already covered by
-- the Handoff 03 exact-startAt partial unique indexes.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap_range_categories"
  EXCLUDE USING gist (
    "providerLocationId" WITH =,
    tsrange("startAt", "endAt") WITH &&
  )
  WHERE ("category" IN ('SITTING', 'BOARDING') AND "bookingStatus" NOT IN ('CANCELLED_BY_USER', 'CANCELLED_BY_PROVIDER'));
