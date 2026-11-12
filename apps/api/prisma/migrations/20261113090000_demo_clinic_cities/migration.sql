-- Demo showcase clinics outside Tehran were seeded with city تهران. Correct only those demo rows (flagged isDemoRecord, "(نمایشی)" in the
-- name, still تهران, address starting with another city); nothing is published or deleted.
UPDATE "provider_locations" AS pl
SET "city" = btrim(split_part(pl."addressLine", '،', 1))
FROM "provider_organizations" AS po
WHERE po."id" = pl."providerOrganizationId"
  AND po."isDemoRecord" = true
  AND po."name" LIKE '%(نمایشی)'
  AND pl."city" = 'تهران'
  AND btrim(split_part(pl."addressLine", '،', 1)) IN ('کرج', 'اصفهان', 'شیراز', 'مشهد');
