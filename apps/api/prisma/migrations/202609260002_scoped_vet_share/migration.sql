ALTER TABLE "pet_access_grants"
  ADD COLUMN "healthScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "selectedDocumentIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN "sharedWithProviderUserId" UUID;
