-- Location pins (2026-11-13): consent timestamps for stored pins and the public-precision choice for home-based
-- businesses. Additive and nullable only: existing rows keep working without a backfill.
ALTER TABLE "customer_addresses" ADD COLUMN "locationConsentAt" TIMESTAMP(3);
ALTER TABLE "provider_locations" ADD COLUMN "pinConsentAt" TIMESTAMP(3);
ALTER TABLE "provider_locations" ADD COLUMN "pinPublicExact" BOOLEAN;
ALTER TABLE "seller_organizations" ADD COLUMN "pinConsentAt" TIMESTAMP(3);
ALTER TABLE "seller_shipping_profiles" ADD COLUMN "pickupPinConsentAt" TIMESTAMP(3);
ALTER TABLE "travel_listings" ADD COLUMN "pinPublicExact" BOOLEAN;
