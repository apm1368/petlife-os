-- Batch 6: donor-chosen public name and the optional support need a donation is for. Additive only.
ALTER TABLE "donation_intents" ADD COLUMN "publicDisplayName" TEXT;
ALTER TABLE "donation_intents" ADD COLUMN "supportNeedListingId" UUID;
CREATE INDEX "donation_intents_supportNeedListingId_idx" ON "donation_intents"("supportNeedListingId");
