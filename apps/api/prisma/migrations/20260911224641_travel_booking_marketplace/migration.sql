-- CreateEnum
CREATE TYPE "TravelListingType" AS ENUM ('PET_FRIENDLY_HOTEL', 'VILLA', 'APARTMENT', 'RESIDENCE', 'BOARDING', 'PET_TAXI', 'INTERCITY_TRANSPORT', 'AIRPORT_TRANSFER', 'TRAVEL_SERVICE', 'ATTRACTION', 'CAFE_RESTAURANT', 'VET_AT_DESTINATION');

-- CreateEnum
CREATE TYPE "TravelPricingMode" AS ENUM ('PER_NIGHT', 'PER_TRIP');

-- CreateEnum
CREATE TYPE "TravelBookingMode" AS ENUM ('INSTANT_BOOKING', 'REQUEST_TO_BOOK');

-- CreateEnum
CREATE TYPE "TravelListingStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TravelBookingStatus" AS ENUM ('DRAFT', 'AWAITING_PROVIDER', 'AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'REFUNDED');

-- NOTE: `prisma migrate diff` emits a `DROP INDEX
-- "pet_friendly_places_location_gist_idx"` here on every migration. That index
-- is the H19 PostGIS GIST index, created by raw SQL because a GIST index over a
-- `geography` column cannot be expressed in schema.prisma — so the differ sees
-- it as drift on each run. Dropping it would silently break pet-friendly-place
-- proximity search, so the statement is removed, exactly as in the H21 and H22
-- migrations.

-- CreateTable
CREATE TABLE "travel_listings" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "TravelListingType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "imageObjectKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pricingMode" "TravelPricingMode" NOT NULL DEFAULT 'PER_NIGHT',
    "bookingMode" "TravelBookingMode" NOT NULL DEFAULT 'REQUEST_TO_BOOK',
    "status" "TravelListingStatus" NOT NULL DEFAULT 'DRAFT',
    "cancellationPolicy" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isPubliclyListed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_pet_policies" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "dogsAllowed" BOOLEAN NOT NULL DEFAULT false,
    "catsAllowed" BOOLEAN NOT NULL DEFAULT false,
    "otherAllowed" BOOLEAN NOT NULL DEFAULT false,
    "maxPets" INTEGER,
    "maxWeightKg" DOUBLE PRECISION,
    "minWeightKg" DOUBLE PRECISION,
    "breedRestrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vaccinationRequired" BOOLEAN NOT NULL DEFAULT false,
    "healthCertificateRequired" BOOLEAN NOT NULL DEFAULT false,
    "carrierRequired" BOOLEAN NOT NULL DEFAULT false,
    "leashRequired" BOOLEAN NOT NULL DEFAULT false,
    "petFeeIrr" INTEGER,
    "depositIrr" INTEGER,
    "restrictedAreas" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_pet_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_inventory_units" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "maxOccupancy" INTEGER,
    "basePriceIrr" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_inventory_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_availability" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "priceIrr" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_bookings" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "householdId" UUID NOT NULL,
    "bookedByUserId" UUID NOT NULL,
    "tripId" UUID,
    "status" "TravelBookingStatus" NOT NULL DEFAULT 'DRAFT',
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "guests" INTEGER NOT NULL DEFAULT 1,
    "nights" INTEGER NOT NULL,
    "baseAmountIrr" INTEGER NOT NULL,
    "petFeeAmountIrr" INTEGER NOT NULL DEFAULT 0,
    "depositAmountIrr" INTEGER NOT NULL DEFAULT 0,
    "totalAmountIrr" INTEGER NOT NULL,
    "cancellationPolicySnapshot" TEXT,
    "providerNote" TEXT,
    "travelerNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_booking_pets" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "petId" UUID NOT NULL,

    CONSTRAINT "travel_booking_pets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_booked_nights" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "night" TIMESTAMP(3) NOT NULL,
    "slot" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_booked_nights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "travel_listings_status_city_idx" ON "travel_listings"("status", "city");

-- CreateIndex
CREATE INDEX "travel_listings_type_idx" ON "travel_listings"("type");

-- CreateIndex
CREATE INDEX "travel_listings_organizationId_idx" ON "travel_listings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "travel_pet_policies_listingId_key" ON "travel_pet_policies"("listingId");

-- CreateIndex
CREATE INDEX "travel_inventory_units_listingId_idx" ON "travel_inventory_units"("listingId");

-- CreateIndex
CREATE INDEX "travel_availability_unitId_date_idx" ON "travel_availability"("unitId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "travel_availability_unitId_date_key" ON "travel_availability"("unitId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "travel_bookings_reference_key" ON "travel_bookings"("reference");

-- CreateIndex
CREATE INDEX "travel_bookings_householdId_status_idx" ON "travel_bookings"("householdId", "status");

-- CreateIndex
CREATE INDEX "travel_bookings_listingId_status_idx" ON "travel_bookings"("listingId", "status");

-- CreateIndex
CREATE INDEX "travel_bookings_tripId_idx" ON "travel_bookings"("tripId");

-- CreateIndex
CREATE INDEX "travel_booking_pets_petId_idx" ON "travel_booking_pets"("petId");

-- CreateIndex
CREATE UNIQUE INDEX "travel_booking_pets_bookingId_petId_key" ON "travel_booking_pets"("bookingId", "petId");

-- CreateIndex
CREATE INDEX "travel_booked_nights_bookingId_idx" ON "travel_booked_nights"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "travel_booked_nights_unitId_night_slot_key" ON "travel_booked_nights"("unitId", "night", "slot");

-- AddForeignKey
ALTER TABLE "travel_listings" ADD CONSTRAINT "travel_listings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_pet_policies" ADD CONSTRAINT "travel_pet_policies_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "travel_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_inventory_units" ADD CONSTRAINT "travel_inventory_units_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "travel_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_availability" ADD CONSTRAINT "travel_availability_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "travel_inventory_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_bookings" ADD CONSTRAINT "travel_bookings_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "travel_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_bookings" ADD CONSTRAINT "travel_bookings_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "travel_inventory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_bookings" ADD CONSTRAINT "travel_bookings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_bookings" ADD CONSTRAINT "travel_bookings_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_booking_pets" ADD CONSTRAINT "travel_booking_pets_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "travel_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_booking_pets" ADD CONSTRAINT "travel_booking_pets_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_booked_nights" ADD CONSTRAINT "travel_booked_nights_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "travel_inventory_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_booked_nights" ADD CONSTRAINT "travel_booked_nights_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "travel_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
