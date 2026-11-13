-- Sponsored listings billed per click (owner #2): flat effective-dated price, campaigns paid from business wallets, click log.

-- CreateEnum
CREATE TYPE "SponsoredPlacement" AS ENUM ('SHOP', 'VETS', 'SERVICES');

-- CreateEnum
CREATE TYPE "SponsoredCampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'STOPPED');

-- CreateEnum
CREATE TYPE "SponsoredClickOutcome" AS ENUM ('BILLED', 'DUPLICATE', 'SELF', 'STAFF', 'BOT', 'INACTIVE', 'ABOVE_CEILING', 'OVER_BUDGET', 'NO_FUNDS');

-- AlterEnum
ALTER TYPE "LedgerAccountCode" ADD VALUE 'CPC_REVENUE';

-- CreateTable
CREATE TABLE "sponsored_cpc_rates" (
    "id" UUID NOT NULL,
    "rateIrr" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "setByAdminId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsored_cpc_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsored_campaigns" (
    "id" UUID NOT NULL,
    "walletAccountId" UUID NOT NULL,
    "placement" "SponsoredPlacement" NOT NULL,
    "sellerOrganizationId" UUID,
    "productId" UUID,
    "providerOrganizationId" UUID,
    "status" "SponsoredCampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "dailyBudgetIrr" INTEGER NOT NULL,
    "maxCpcIrr" INTEGER NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "staffHeldAt" TIMESTAMP(3),
    "staffHoldReason" TEXT,
    "stoppedAt" TIMESTAMP(3),
    "stoppedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsored_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsored_clicks" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "SponsoredClickOutcome" NOT NULL,
    "costIrr" INTEGER NOT NULL DEFAULT 0,
    "rateIrr" INTEGER NOT NULL,
    "viewerUserId" UUID,
    "ipHash" TEXT,
    "walletEntryId" UUID,
    "invalidatedAt" TIMESTAMP(3),
    "invalidatedByAdminId" UUID,
    "invalidReason" TEXT,
    "creditEntryId" UUID,
    "personalDataErasedAt" TIMESTAMP(3),

    CONSTRAINT "sponsored_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sponsored_cpc_rates_effectiveFrom_idx" ON "sponsored_cpc_rates"("effectiveFrom");

-- CreateIndex
CREATE INDEX "sponsored_campaigns_placement_status_idx" ON "sponsored_campaigns"("placement", "status");

-- CreateIndex
CREATE INDEX "sponsored_campaigns_walletAccountId_createdAt_idx" ON "sponsored_campaigns"("walletAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sponsored_clicks_walletEntryId_key" ON "sponsored_clicks"("walletEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "sponsored_clicks_creditEntryId_key" ON "sponsored_clicks"("creditEntryId");

-- CreateIndex
CREATE INDEX "sponsored_clicks_campaignId_day_idx" ON "sponsored_clicks"("campaignId", "day");

-- CreateIndex
CREATE INDEX "sponsored_clicks_clickedAt_idx" ON "sponsored_clicks"("clickedAt");

-- AddForeignKey
ALTER TABLE "sponsored_cpc_rates" ADD CONSTRAINT "sponsored_cpc_rates_setByAdminId_fkey" FOREIGN KEY ("setByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_campaigns" ADD CONSTRAINT "sponsored_campaigns_walletAccountId_fkey" FOREIGN KEY ("walletAccountId") REFERENCES "wallet_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_campaigns" ADD CONSTRAINT "sponsored_campaigns_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_campaigns" ADD CONSTRAINT "sponsored_campaigns_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_campaigns" ADD CONSTRAINT "sponsored_campaigns_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_clicks" ADD CONSTRAINT "sponsored_clicks_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "sponsored_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Money and limits are positive integers (rials).
ALTER TABLE "sponsored_cpc_rates" ADD CONSTRAINT "sponsored_cpc_rates_rate_check" CHECK ("rateIrr" > 0);
ALTER TABLE "sponsored_cpc_rates" ADD CONSTRAINT "sponsored_cpc_rates_reason_check" CHECK (length(btrim("reason")) >= 5);
ALTER TABLE "sponsored_campaigns" ADD CONSTRAINT "sponsored_campaigns_budget_check" CHECK ("dailyBudgetIrr" > 0 AND "maxCpcIrr" > 0);
ALTER TABLE "sponsored_clicks" ADD CONSTRAINT "sponsored_clicks_cost_check" CHECK ("costIrr" >= 0 AND ("outcome" = 'BILLED') = ("costIrr" > 0) AND ("outcome" <> 'BILLED' OR "walletEntryId" IS NOT NULL));

-- A campaign promotes exactly one listing: a product of a seller (shop), or a provider organisation (vets/services).
ALTER TABLE "sponsored_campaigns" ADD CONSTRAINT "sponsored_campaigns_target_check" CHECK (
  ("placement" = 'SHOP' AND "productId" IS NOT NULL AND "sellerOrganizationId" IS NOT NULL AND "providerOrganizationId" IS NULL)
  OR ("placement" IN ('VETS', 'SERVICES') AND "providerOrganizationId" IS NOT NULL AND "productId" IS NULL AND "sellerOrganizationId" IS NULL)
);

-- One live campaign per listing and placement.
CREATE UNIQUE INDEX "sponsored_campaigns_one_live_product" ON "sponsored_campaigns"("placement", "productId", "sellerOrganizationId") WHERE "status" <> 'STOPPED' AND "productId" IS NOT NULL;
CREATE UNIQUE INDEX "sponsored_campaigns_one_live_provider" ON "sponsored_campaigns"("placement", "providerOrganizationId") WHERE "status" <> 'STOPPED' AND "providerOrganizationId" IS NOT NULL;

-- P-01 and the owner's rule: at most one billed click per listing per Tehran day for each signed-in viewer and for
-- each IP (the service checks first under the wallet lock; these are the backstop).
CREATE UNIQUE INDEX "sponsored_clicks_one_billed_per_viewer_day" ON "sponsored_clicks"("campaignId", "day", "viewerUserId") WHERE "outcome" = 'BILLED' AND "viewerUserId" IS NOT NULL;
CREATE UNIQUE INDEX "sponsored_clicks_one_billed_per_ip_day" ON "sponsored_clicks"("campaignId", "day", "ipHash") WHERE "outcome" = 'BILLED' AND "ipHash" IS NOT NULL;
