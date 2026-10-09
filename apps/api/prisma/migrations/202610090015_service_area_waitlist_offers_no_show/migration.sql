-- CreateEnum
CREATE TYPE "NoShowParty" AS ENUM ('OWNER', 'PROVIDER');

-- AlterEnum
ALTER TYPE "WaitlistStatus" ADD VALUE 'OFFERED';

-- AlterTable
ALTER TABLE "booking_waitlist_entries" ADD COLUMN     "offerExpiresAt" TIMESTAMP(3),
ADD COLUMN     "offerProviderUserId" UUID,
ADD COLUMN     "offerStartAt" TIMESTAMP(3),
ADD COLUMN     "offeredByUserId" UUID;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "noShowParty" "NoShowParty";

-- AlterTable
ALTER TABLE "provider_services" ADD COLUMN     "serviceAreaCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "travelSurchargeIrr" INTEGER;


-- Every existing NO_SHOW was marked by the provider: the member did not show up.
UPDATE "bookings" SET "noShowParty" = 'OWNER' WHERE "bookingStatus" = 'NO_SHOW';
