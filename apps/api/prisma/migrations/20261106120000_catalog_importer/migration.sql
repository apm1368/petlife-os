CREATE TYPE "CatalogImportJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');
CREATE TYPE "CatalogImportItemStatus" AS ENUM ('IMPORTED', 'NEEDS_REVIEW', 'FAILED', 'DUPLICATE');

CREATE TABLE "catalog_import_jobs" (
  "id" UUID NOT NULL,
  "status" "CatalogImportJobStatus" NOT NULL DEFAULT 'QUEUED',
  "submittedUrls" TEXT[] NOT NULL,
  "targetCategoryId" UUID NOT NULL,
  "targetBrandId" UUID,
  "maxPages" INTEGER NOT NULL DEFAULT 5,
  "maxProducts" INTEGER NOT NULL DEFAULT 50,
  "pagesVisited" INTEGER NOT NULL DEFAULT 0,
  "productsSeen" INTEGER NOT NULL DEFAULT 0,
  "productsImported" INTEGER NOT NULL DEFAULT 0,
  "productsFailed" INTEGER NOT NULL DEFAULT 0,
  "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "idempotencyKey" TEXT NOT NULL,
  "requestedById" UUID NOT NULL,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "catalog_import_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_import_items" (
  "id" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'DIGIKALA',
  "sourceItemId" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourceSnapshot" JSONB NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "pendingSnapshot" JSONB,
  "productId" UUID,
  "status" "CatalogImportItemStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
  "errorCode" TEXT,
  "errorDetail" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "catalog_import_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalog_import_jobs_idempotencyKey_key" ON "catalog_import_jobs"("idempotencyKey");
CREATE INDEX "catalog_import_jobs_status_nextAttemptAt_idx" ON "catalog_import_jobs"("status", "nextAttemptAt");
CREATE INDEX "catalog_import_jobs_requestedById_createdAt_idx" ON "catalog_import_jobs"("requestedById", "createdAt");
CREATE UNIQUE INDEX "catalog_import_items_jobId_sourceItemId_key" ON "catalog_import_items"("jobId", "sourceItemId");
CREATE INDEX "catalog_import_items_source_sourceItemId_createdAt_idx" ON "catalog_import_items"("source", "sourceItemId", "createdAt");
CREATE INDEX "catalog_import_items_jobId_status_idx" ON "catalog_import_items"("jobId", "status");
CREATE INDEX "catalog_import_items_productId_idx" ON "catalog_import_items"("productId");

ALTER TABLE "catalog_import_jobs" ADD CONSTRAINT "catalog_import_jobs_targetCategoryId_fkey"
  FOREIGN KEY ("targetCategoryId") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_import_jobs" ADD CONSTRAINT "catalog_import_jobs_targetBrandId_fkey"
  FOREIGN KEY ("targetBrandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_import_items" ADD CONSTRAINT "catalog_import_items_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "catalog_import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_import_items" ADD CONSTRAINT "catalog_import_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_media" ADD COLUMN "sourceUrl" TEXT;
