-- Shipping methods: opetlife courier and Post Pishtaz, staff-managed method settings, seller pickup profiles,
-- and an address book with neighbourhood + archive. Quotes record how their price was reached.

-- AlterEnum


ALTER TYPE "ShippingProvider" ADD VALUE 'OPETLIFE_COURIER';
ALTER TYPE "ShippingProvider" ADD VALUE 'POST_PISHTAZ';

-- AlterTable
ALTER TABLE "customer_addresses" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "area" TEXT;

-- AlterTable
ALTER TABLE "shipping_quotes" ADD COLUMN     "pricingBasis" TEXT;

-- CreateTable
CREATE TABLE "seller_shipping_profiles" (
    "sellerOrganizationId" UUID NOT NULL,
    "offeredProviders" "ShippingProvider"[] DEFAULT ARRAY[]::"ShippingProvider"[],
    "pickupContactName" TEXT,
    "pickupPhone" TEXT,
    "pickupAddressLine" TEXT,
    "pickupCity" TEXT,
    "pickupRegion" TEXT,
    "pickupArea" TEXT,
    "pickupPostalCode" TEXT,
    "pickupLatitude" DOUBLE PRECISION,
    "pickupLongitude" DOUBLE PRECISION,
    "pickupInstructions" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_shipping_profiles_pkey" PRIMARY KEY ("sellerOrganizationId")
);

-- CreateTable
CREATE TABLE "shipping_method_settings" (
    "provider" "ShippingProvider" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "updatedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_method_settings_pkey" PRIMARY KEY ("provider")
);

-- AddForeignKey
ALTER TABLE "seller_shipping_profiles" ADD CONSTRAINT "seller_shipping_profiles_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

