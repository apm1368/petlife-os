-- Partner signup ("ثبت‌نام همکار"): multi-kind service businesses, a link to the same owner's shop, the shop's postal
-- address and display-only opening hours, and the account's signup intent (partners skip the pet-owner onboarding).
ALTER TABLE "users" ADD COLUMN "signupIntent" TEXT NOT NULL DEFAULT 'PET_OWNER';

ALTER TABLE "provider_organizations" ADD COLUMN "serviceKinds" "ProviderType"[] NOT NULL DEFAULT ARRAY[]::"ProviderType"[],
ADD COLUMN "linkedSellerOrganizationId" UUID;
CREATE UNIQUE INDEX "provider_organizations_linkedSellerOrganizationId_key" ON "provider_organizations"("linkedSellerOrganizationId");
ALTER TABLE "provider_organizations" ADD CONSTRAINT "provider_organizations_linkedSellerOrganizationId_fkey" FOREIGN KEY ("linkedSellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "seller_organizations" ADD COLUMN "province" TEXT,
ADD COLUMN "addressLine" TEXT,
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "openingHours" JSONB;
