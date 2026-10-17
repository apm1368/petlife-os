-- Batch 6: the owner-chosen approximate area is the only location shown publicly.
ALTER TABLE "lost_pet_incidents" ADD COLUMN "publicArea" TEXT;
