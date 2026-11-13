-- Booking access keeps the owner's consent even while no staff member is assigned ("any staff"), so the
-- person the clinic assigns later receives it; it also records the owner documents ticked for the booking's
-- vet. Additive and idempotent: re-running changes nothing.

ALTER TABLE "booking_pet_access" ALTER COLUMN "petAccessGrantId" DROP NOT NULL;
ALTER TABLE "booking_pet_access" ADD COLUMN IF NOT EXISTS "healthConsented" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "booking_pet_access" ADD COLUMN IF NOT EXISTS "sharedDocumentIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

-- Existing links already say whether the owner consented to health: the grant's reason carries it.
UPDATE "booking_pet_access" AS bpa
SET "healthConsented" = true
FROM "pet_access_grants" AS g
WHERE g."id" = bpa."petAccessGrantId"
  AND g."reason" LIKE '%\_BOOKING\_HEALTH\_CONSENT'
  AND bpa."healthConsented" = false;
