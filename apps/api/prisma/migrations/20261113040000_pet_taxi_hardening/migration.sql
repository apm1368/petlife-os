-- Pet taxi: fare rules chosen by the pickup point (city bounding boxes), per-driver vetting, ride place retention.

-- CreateEnum
CREATE TYPE "PetTaxiDriverStatus" AS ENUM ('PENDING', 'VERIFIED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "pet_taxi_fare_rules" ADD COLUMN     "east" DOUBLE PRECISION,
ADD COLUMN     "north" DOUBLE PRECISION,
ADD COLUMN     "south" DOUBLE PRECISION,
ADD COLUMN     "west" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "pet_taxi_rides" ADD COLUMN     "coordinatesRedactedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "pet_taxi_drivers" (
    "id" UUID NOT NULL,
    "providerUserId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "licenceNumber" TEXT NOT NULL,
    "vehiclePlate" TEXT NOT NULL,
    "vehicleDescription" TEXT NOT NULL,
    "status" "PetTaxiDriverStatus" NOT NULL DEFAULT 'PENDING',
    "statusReason" TEXT,
    "registeredByUserId" UUID NOT NULL,
    "verifiedByAdminId" UUID,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_taxi_drivers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pet_taxi_drivers_providerUserId_key" ON "pet_taxi_drivers"("providerUserId");

-- CreateIndex
CREATE INDEX "pet_taxi_drivers_providerOrganizationId_idx" ON "pet_taxi_drivers"("providerOrganizationId");

-- CreateIndex
CREATE INDEX "pet_taxi_drivers_status_idx" ON "pet_taxi_drivers"("status");
