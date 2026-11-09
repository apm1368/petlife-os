-- Keep QA taxonomy out of public shop navigation. New QA seeds set the
-- provenance field directly; this backfill is limited to the reserved fixture
-- slug prefix already used by seed-batch4 and does not infer from product text.
ALTER TABLE "product_categories"
  ADD COLUMN "isDemoRecord" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "product_categories"
SET "isDemoRecord" = TRUE
WHERE "slug" LIKE 'qa-b4-%';
