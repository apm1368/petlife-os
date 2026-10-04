-- Pet taxi as mobility: per-service distance pricing (inactive by default) and an immutable route/fare
-- snapshot per booking. Additive only.
-- CreateEnum
CREATE TYPE "TransportDistanceSource" AS ENUM ('MAP_PROVIDER', 'STRAIGHT_LINE_DEMO', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "service_transport_pricing" (
    "id" UUID NOT NULL,
    "providerServiceId" UUID NOT NULL,
    "baseFareIrr" INTEGER NOT NULL,
    "perKmRateIrr" INTEGER NOT NULL,
    "serviceAdjustmentIrr" INTEGER NOT NULL DEFAULT 0,
    "minimumFareIrr" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_transport_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_transport_routes" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "pickupAddressText" TEXT NOT NULL,
    "pickupLat" DOUBLE PRECISION,
    "pickupLng" DOUBLE PRECISION,
    "dropoffAddressText" TEXT NOT NULL,
    "dropoffLat" DOUBLE PRECISION,
    "dropoffLng" DOUBLE PRECISION,
    "distanceMeters" INTEGER,
    "distanceSource" "TransportDistanceSource" NOT NULL,
    "baseFareIrr" INTEGER,
    "perKmRateIrr" INTEGER,
    "serviceAdjustmentIrr" INTEGER,
    "minimumFareIrr" INTEGER,
    "estimatedFareIrr" INTEGER,
    "distancePricingApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_transport_routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_transport_pricing_providerServiceId_key" ON "service_transport_pricing"("providerServiceId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_transport_routes_bookingId_key" ON "booking_transport_routes"("bookingId");

-- AddForeignKey
ALTER TABLE "service_transport_pricing" ADD CONSTRAINT "service_transport_pricing_providerServiceId_fkey" FOREIGN KEY ("providerServiceId") REFERENCES "provider_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_transport_routes" ADD CONSTRAINT "booking_transport_routes_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Money is integer IRR and never negative.
ALTER TABLE "service_transport_pricing" ADD CONSTRAINT "service_transport_pricing_amounts_nonneg" CHECK ("baseFareIrr" >= 0 AND "perKmRateIrr" >= 0 AND ("minimumFareIrr" IS NULL OR "minimumFareIrr" >= 0));
ALTER TABLE "booking_transport_routes" ADD CONSTRAINT "booking_transport_routes_distance_nonneg" CHECK ("distanceMeters" IS NULL OR "distanceMeters" >= 0);
