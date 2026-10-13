-- Decision 3 remediation REPORT (read-only; nothing is revoked automatically).
-- Before decision 3, every household member got an automatic HOUSEHOLD grant on each new pet (FAMILY: view
-- health, location, care profile, book care). Lists those grants that are still active for non-owners, plus
-- HOUSEHOLD grants whose holder is no longer a member of the pet's household. The owner decides what to revoke.
--   docker exec -i petlife-os-postgres-1 psql -U petlife -d petlife_os < scripts/ops/report-membership-grants.sql

\echo '== Active HOUSEHOLD grants held by non-owner members'
SELECT g.id AS grant_id, g."petId", g."userId", hm.role, g."createdAt"::date AS granted_on,
       g."canViewHealth" AS health, g."canViewLocation" AS location, g."canBookCare" AS book_care,
       g."canViewCareProfile" AS care_profile, g."canEditCareProfile" AS edit_care
FROM pet_access_grants g
JOIN pets p ON p.id = g."petId"
JOIN household_members hm ON hm."householdId" = p."householdId" AND hm."userId" = g."userId"
WHERE g.source = 'HOUSEHOLD' AND g."revokedAt" IS NULL AND (g."expiresAt" IS NULL OR g."expiresAt" > now())
  AND hm.role <> 'OWNER'
ORDER BY g."createdAt";

\echo '== Active HOUSEHOLD grants whose holder is no longer in the pet''s household'
SELECT g.id AS grant_id, g."petId", g."userId", g."createdAt"::date AS granted_on
FROM pet_access_grants g
JOIN pets p ON p.id = g."petId"
WHERE g.source = 'HOUSEHOLD' AND g."revokedAt" IS NULL AND (g."expiresAt" IS NULL OR g."expiresAt" > now())
  AND NOT EXISTS (SELECT 1 FROM household_members hm WHERE hm."householdId" = p."householdId" AND hm."userId" = g."userId")
ORDER BY g."createdAt";
