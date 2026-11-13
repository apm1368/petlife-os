-- On-demand pet taxi: rides with a live driver position, per-city fare rules, driver presence and declines.

-- CreateEnum
CREATE TYPE "PetTaxiCarrierSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "PetTaxiRideStatus" AS ENUM ('SEARCHING', 'DRIVER_ASSIGNED', 'ARRIVING', 'PICKED_UP', 'COMPLETED', 'CANCELLED_BY_MEMBER', 'CANCELLED_BY_DRIVER', 'NO_DRIVER');

-- CreateTable
CREATE TABLE "pet_taxi_fare_rules" (
    "id" UUID NOT NULL,
    "city" TEXT NOT NULL,
    "baseFareIrr" INTEGER NOT NULL,
    "perKmIrr" INTEGER NOT NULL,
    "perMinuteIrr" INTEGER NOT NULL DEFAULT 0,
    "minimumFareIrr" INTEGER NOT NULL DEFAULT 0,
    "mediumSurchargePercent" INTEGER NOT NULL DEFAULT 15,
    "largeSurchargePercent" INTEGER NOT NULL DEFAULT 35,
    "extraPetIrr" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_taxi_fare_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_taxi_driver_presence" (
    "providerUserId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_taxi_driver_presence_pkey" PRIMARY KEY ("providerUserId")
);

-- CreateTable
CREATE TABLE "pet_taxi_rides" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "householdId" UUID,
    "petIds" UUID[],
    "carrierSize" "PetTaxiCarrierSize" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "pickupLabel" TEXT NOT NULL,
    "pickupLatitude" DOUBLE PRECISION NOT NULL,
    "pickupLongitude" DOUBLE PRECISION NOT NULL,
    "pickupCity" TEXT,
    "pickupNote" TEXT,
    "dropoffLabel" TEXT NOT NULL,
    "dropoffLatitude" DOUBLE PRECISION NOT NULL,
    "dropoffLongitude" DOUBLE PRECISION NOT NULL,
    "distanceMeters" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "routeSource" TEXT NOT NULL,
    "fareIrr" INTEGER NOT NULL,
    "fareBreakdown" JSONB NOT NULL,
    "fareRuleCity" TEXT NOT NULL,
    "status" "PetTaxiRideStatus" NOT NULL DEFAULT 'SEARCHING',
    "searchExpiresAt" TIMESTAMP(3) NOT NULL,
    "providerOrganizationId" UUID,
    "driverProviderUserId" UUID,
    "driverUserId" UUID,
    "driverLatitude" DOUBLE PRECISION,
    "driverLongitude" DOUBLE PRECISION,
    "driverLocatedAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "arrivingAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "rating" INTEGER,
    "ratingComment" TEXT,
    "ratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_taxi_rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_taxi_ride_declines" (
    "rideId" UUID NOT NULL,
    "providerUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_taxi_ride_declines_pkey" PRIMARY KEY ("rideId","providerUserId")
);

-- CreateIndex
CREATE UNIQUE INDEX "pet_taxi_fare_rules_city_key" ON "pet_taxi_fare_rules"("city");

-- CreateIndex
CREATE INDEX "pet_taxi_driver_presence_online_locatedAt_idx" ON "pet_taxi_driver_presence"("online", "locatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pet_taxi_rides_idempotencyKey_key" ON "pet_taxi_rides"("idempotencyKey");

-- CreateIndex
CREATE INDEX "pet_taxi_rides_status_searchExpiresAt_idx" ON "pet_taxi_rides"("status", "searchExpiresAt");

-- CreateIndex
CREATE INDEX "pet_taxi_rides_userId_createdAt_idx" ON "pet_taxi_rides"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "pet_taxi_rides_driverProviderUserId_status_idx" ON "pet_taxi_rides"("driverProviderUserId", "status");

-- AddForeignKey
ALTER TABLE "pet_taxi_rides" ADD CONSTRAINT "pet_taxi_rides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_taxi_ride_declines" ADD CONSTRAINT "pet_taxi_ride_declines_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "pet_taxi_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity the service also enforces.
ALTER TABLE "pet_taxi_rides" ADD CONSTRAINT "pet_taxi_rides_fare_positive" CHECK ("fareIrr" > 0);
ALTER TABLE "pet_taxi_rides" ADD CONSTRAINT "pet_taxi_rides_rating_range" CHECK ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5));
ALTER TABLE "pet_taxi_rides" ADD CONSTRAINT "pet_taxi_rides_assigned_has_driver" CHECK ("status" IN ('SEARCHING', 'NO_DRIVER', 'CANCELLED_BY_MEMBER') OR "driverProviderUserId" IS NOT NULL);
ALTER TABLE "pet_taxi_fare_rules" ADD CONSTRAINT "pet_taxi_fare_rules_non_negative" CHECK ("baseFareIrr" >= 0 AND "perKmIrr" >= 0 AND "perMinuteIrr" >= 0 AND "minimumFareIrr" >= 0 AND "extraPetIrr" >= 0);
