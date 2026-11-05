-- Mark known development fixtures already present in long-lived databases.
-- Real records are not classified by display name broadly; these are the exact
-- slugs/names/codes authored by prisma/seed.ts and its documented placeholder prices.
ALTER TABLE "provider_organizations" ADD COLUMN "isDemoRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "isDemoRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "subscription_plans" ADD COLUMN "isDemoRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pet_friendly_places" ADD COLUMN "isDemoRecord" BOOLEAN NOT NULL DEFAULT false;

UPDATE "provider_organizations"
SET "isDemoRecord" = true
WHERE "name" IN (
  'Tehran Pet Care Clinic',
  'Happy Paws Grooming',
  'Good Dog Training',
  'City Paws Walking',
  'Cozy Home Sitting',
  'Tehran Pet Boarding',
  'PetGo Taxi'
);

UPDATE "products"
SET "isDemoRecord" = true
WHERE "slug" IN (
  'royal-canin-adult-dog-food',
  'royal-canin-kitten-food',
  'grain-free-training-treats',
  'calming-grooming-wipes',
  'soft-sided-travel-carrier'
);

-- Only classify paid plans carrying the exact seed price set. A real plan
-- with a familiar code but owner-configured prices is left untouched.
UPDATE "subscription_plans" AS plan
SET "isDemoRecord" = true
WHERE plan."isFree" = false
  AND (
    (plan."code" = 'plus' AND (
      SELECT ARRAY_AGG(price."amount" ORDER BY price."amount")
      FROM "subscription_plan_prices" AS price WHERE price."planId" = plan."id"
    ) = ARRAY[990000, 2790000, 9900000]::INTEGER[])
    OR
    (plan."code" = 'premium' AND (
      SELECT ARRAY_AGG(price."amount" ORDER BY price."amount")
      FROM "subscription_plan_prices" AS price WHERE price."planId" = plan."id"
    ) = ARRAY[1990000, 5590000, 19900000]::INTEGER[])
  );
