-- Product media used to accept only a rendered URL. Keep that column for
-- legacy catalogue entries, and retain the scoped storage key for every new
-- direct upload so the API can prove it belongs to the product being edited.
ALTER TABLE "product_media"
  ADD COLUMN "objectKey" TEXT;

CREATE UNIQUE INDEX "product_media_objectKey_key"
  ON "product_media"("objectKey");
