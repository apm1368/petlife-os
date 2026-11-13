-- The Digikala facts run's sub-category plan and cursor (resume after a restart).
ALTER TABLE "catalog_import_jobs" ADD COLUMN "progress" JSONB;
