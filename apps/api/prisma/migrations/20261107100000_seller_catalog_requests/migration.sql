CREATE TYPE "CatalogProductRequestStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'MATCHED_EXISTING', 'REJECTED');

CREATE TABLE "catalog_product_requests" (
  "id" UUID NOT NULL,
  "sellerOrganizationId" UUID NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "categoryId" UUID,
  "resolvedProductId" UUID,
  "reviewedByAdminId" UUID,
  "requestedTitle" TEXT NOT NULL,
  "normalizedTitle" TEXT NOT NULL,
  "brandName" TEXT,
  "description" TEXT,
  "specifications" JSONB,
  "sourceUrl" TEXT,
  "sourceName" TEXT,
  "status" "CatalogProductRequestStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "decisionReason" TEXT,
  "duplicateReview" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "catalog_product_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_product_requests_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "seller_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_product_requests_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_product_requests_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "catalog_product_requests_resolvedProductId_fkey" FOREIGN KEY ("resolvedProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "catalog_product_requests_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "catalog_product_requests_sellerOrganizationId_status_createdAt_idx" ON "catalog_product_requests"("sellerOrganizationId", "status", "createdAt");
CREATE INDEX "catalog_product_requests_status_createdAt_idx" ON "catalog_product_requests"("status", "createdAt");
CREATE INDEX "catalog_product_requests_resolvedProductId_idx" ON "catalog_product_requests"("resolvedProductId");
CREATE INDEX "catalog_product_requests_sellerOrganizationId_normalizedTitle_status_idx" ON "catalog_product_requests"("sellerOrganizationId", "normalizedTitle", "status");
CREATE UNIQUE INDEX "catalog_product_requests_one_pending_title_per_seller" ON "catalog_product_requests"("sellerOrganizationId", "normalizedTitle") WHERE "status" = 'PENDING_REVIEW';
