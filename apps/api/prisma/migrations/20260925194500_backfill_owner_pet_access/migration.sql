-- Ensure every existing household owner has the canonical owner grant for
-- each non-deleted pet in that household. This is additive and does not alter
-- or replace any existing manual, temporary, provider, or family grant.
INSERT INTO "pet_access_grants" (
  "id", "petId", "userId",
  "canViewIdentity", "canEditIdentity",
  "canViewHealth", "canEditHealth",
  "canBookCare",
  "canViewCareProfile", "canEditCareProfile",
  "canViewLocation", "canManageAccess", "canRecordClinicalData",
  "source", "grantedByUserId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), pet."id", member."userId",
  true, true,
  true, true,
  true,
  true, true,
  true, true, false,
  'HOUSEHOLD', member."userId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "pets" AS pet
JOIN "household_members" AS member
  ON member."householdId" = pet."householdId"
 AND member."role" = 'OWNER'
WHERE pet."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "pet_access_grants" AS grant_row
    WHERE grant_row."petId" = pet."id"
      AND grant_row."userId" = member."userId"
      AND grant_row."source" = 'HOUSEHOLD'
      AND grant_row."revokedAt" IS NULL
      AND (grant_row."startsAt" IS NULL OR grant_row."startsAt" <= CURRENT_TIMESTAMP)
      AND (grant_row."expiresAt" IS NULL OR grant_row."expiresAt" > CURRENT_TIMESTAMP)
      AND grant_row."canManageAccess" = true
  );
