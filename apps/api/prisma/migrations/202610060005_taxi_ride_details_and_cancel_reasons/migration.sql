-- CreateEnum
CREATE TYPE "RideEventType" AS ENUM ('DRIVER_ASSIGNED', 'ARRIVING', 'PICKED_UP', 'DROPPED_OFF');


-- AlterTable
ALTER TABLE "booking_transport_routes" ADD COLUMN     "pickupContactName" TEXT,
ADD COLUMN     "pickupContactPhone" TEXT,
ADD COLUMN     "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "cancellationReasonCode" TEXT;

-- CreateTable
CREATE TABLE "booking_ride_events" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "type" "RideEventType" NOT NULL,
    "actorProviderUserId" UUID NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_ride_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_ride_events_bookingId_occurredAt_idx" ON "booking_ride_events"("bookingId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "booking_ride_events_bookingId_type_key" ON "booking_ride_events"("bookingId", "type");

-- AddForeignKey
ALTER TABLE "booking_ride_events" ADD CONSTRAINT "booking_ride_events_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancellation_reason_code" CHECK ("cancellationReasonCode" IS NULL OR "cancellationReasonCode" IN (
  'OWNER_CHANGED_PLANS', 'OWNER_PET_UNWELL', 'OWNER_FOUND_ALTERNATIVE', 'OWNER_OTHER',
  'PROVIDER_UNAVAILABLE', 'PROVIDER_VEHICLE_ISSUE', 'PROVIDER_SAFETY_CONCERN', 'PROVIDER_OTHER',
  'SYSTEM_EXPIRED', 'SYSTEM_PAYMENT_FAILED'));
ALTER TABLE "booking_transport_routes" ADD CONSTRAINT "booking_transport_routes_requirements" CHECK ("requirements" <@ ARRAY['CRATE_REQUIRED', 'LARGE_PET', 'MEDICAL_TRANSPORT', 'MULTIPLE_PETS', 'ASSISTANT_REQUIRED']::text[]);
ALTER TABLE "booking_transport_routes" ADD CONSTRAINT "booking_transport_routes_pickup_contact" CHECK (
  ("pickupContactName" IS NULL) = ("pickupContactPhone" IS NULL) AND coalesce(char_length("pickupContactName"), 0) <= 80 AND coalesce(char_length("pickupContactPhone"), 0) <= 20);
