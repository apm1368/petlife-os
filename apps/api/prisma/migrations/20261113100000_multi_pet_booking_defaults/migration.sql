-- Owner 2026-11-13: a member may bring several pets in one booking. New services allow up to 4 pets; services still
-- on the old default of 1 move to 4, and a pet taxi to 3 (its vehicle capacity; the ride price does not change with
-- the number of pets). Providers can lower or raise the limit (1-10) in their service settings.
ALTER TABLE "provider_services" ALTER COLUMN "maxPetsPerBooking" SET DEFAULT 4;
UPDATE "provider_services" SET "maxPetsPerBooking" = CASE WHEN "category" = 'PET_TAXI' OR "locationMode" = 'TRANSPORT' THEN 3 ELSE 4 END WHERE "maxPetsPerBooking" = 1;
