-- Batch 6: partial fulfillment, pause, in-progress offers, offer timing and expiry reminders. Additive only.
ALTER TYPE "SupportNeedStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_FULFILLED';
ALTER TYPE "SupportNeedStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "HelpOfferStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TABLE "help_offers" ADD COLUMN "timing" TEXT;
ALTER TABLE "support_need_listings" ADD COLUMN "expiryWarnedAt" TIMESTAMP(3);
