-- Cancelled or staff-archived partner signups are removed from active
-- onboarding while any referenced business wallet/history remains intact.
ALTER TABLE "provider_organizations"
  ADD COLUMN "onboardingArchivedAt" TIMESTAMP(3),
  ADD COLUMN "onboardingArchiveReason" TEXT,
  ADD COLUMN "onboardingWalletRetained" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "seller_organizations"
  ADD COLUMN "onboardingArchivedAt" TIMESTAMP(3),
  ADD COLUMN "onboardingArchiveReason" TEXT,
  ADD COLUMN "onboardingWalletRetained" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "provider_organizations_onboardingArchivedAt_idx"
  ON "provider_organizations"("onboardingArchivedAt");
CREATE INDEX "seller_organizations_onboardingArchivedAt_idx"
  ON "seller_organizations"("onboardingArchivedAt");
