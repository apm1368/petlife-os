-- The owner's one-time Digikala pet-category import, facts only (no photos, no descriptions).
ALTER TABLE "catalog_import_jobs" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'PAGES';
