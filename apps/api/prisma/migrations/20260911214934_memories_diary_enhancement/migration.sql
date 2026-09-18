-- Handoff 21 (Memories/Diary enhancement): additive only.
--
-- NOTE: prisma migrate diff's auto-generated draft for this migration also
-- included `DROP INDEX "pet_friendly_places_location_gist_idx"` — a false
-- positive. That index is a raw-SQL `USING GIST` spatial index (Handoff 19,
-- see 20260908000000_travel_insurance_pet_friendly_places/migration.sql)
-- that `schema.prisma` cannot model, so Prisma's shadow-DB diff always sees
-- it as drift to remove. It must never be dropped — PetFriendlyPlace nearby
-- search depends on it. Deliberately excluded from this migration.

-- AlterTable
ALTER TABLE "pet_memories" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "title" DROP NOT NULL;
