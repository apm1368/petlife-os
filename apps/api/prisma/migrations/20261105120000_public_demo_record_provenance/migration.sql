-- Mark known development fixtures already present in long-lived databases.
-- Real records are not classified by display name broadly; these are the exact
-- slugs/names/codes authored by prisma/seed.ts and its documented placeholder prices.
ALTER TABLE "provider_organizations" ADD COLUMN "isDemoRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "isDemoRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "subscription_plans" ADD COLUMN "isDemoRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pet_friendly_places" ADD COLUMN "isDemoRecord" BOOLEAN NOT NULL DEFAULT false;

-- Batch 5 uses deterministic fixture IDs. Backfill the existing QA travel
-- partners and places without matching real records by user-visible names.
UPDATE "provider_organizations"
SET "isDemoRecord" = true
WHERE "id" IN (
  '864ee4b2-550b-4151-8a75-9a872a513178'::uuid,
  'cff3c371-7ad8-4b87-8004-883e963ce58f'::uuid,
  '765d8261-e238-40b6-8bdb-ef143863e930'::uuid
);

UPDATE "pet_friendly_places"
SET "isDemoRecord" = true
WHERE "id" IN (
  '2daa028d-d66e-4b43-8205-639bece35c5f'::uuid,
  'bd2973b4-f253-4a36-8e62-360d370e7fa2'::uuid,
  'a7ab945a-e6b4-4330-8a7b-c91eec890405'::uuid,
  '11aa1a79-a78f-4c47-8bd3-5ea967bc6c98'::uuid,
  'e1cc5c48-463a-4fe5-88aa-2d617ee9bdf8'::uuid,
  '7a965ece-001d-4e66-8974-9f712df5680f'::uuid,
  '5fc75a1a-e2fd-46ae-8951-39dad353800e'::uuid,
  '71bf32ed-8f59-4f53-8215-d63979e0d0f4'::uuid,
  '585c00d3-4aeb-4e44-85d3-7b6f221fab5c'::uuid,
  '2d8b96cf-f91d-4d7b-8b8e-04d81d41d027'::uuid,
  '769032f2-df3c-4974-86cf-340499c07c74'::uuid
);

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

-- Batch 4 commerce QA fixtures have lived in long-running databases under a
-- reserved qa-b4-* slug namespace. Mark every known fixture when upgrading
-- those databases; otherwise the new boolean's safe default would classify
-- these legacy demo products as real.
UPDATE "products"
SET "isDemoRecord" = true
WHERE "slug" IN (
  'qa-b4-dry-dog',
  'qa-b4-cat-pouch',
  'qa-b4-litter',
  'qa-b4-harness',
  'qa-b4-omega',
  'qa-b4-shampoo',
  'qa-b4-cat-toy',
  'qa-b4-dog-bed',
  'qa-b4-carrier',
  'qa-b4-dog-treats',
  'qa-b4-scratcher'
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
