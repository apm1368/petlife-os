-- Membership sold by features, not pet count (owner decision 2026-10-04). Data only, idempotent:
-- plans are matched by code and left alone where they do not exist; existing subscriptions are untouched.
-- Billing periods offered: monthly, quarterly, annual (semi-annual prices are retired, not deleted).

WITH catalog(code, key, type, bool_value, limit_value) AS (VALUES
  ('free',    'pets.max',                'LIMIT',   NULL::boolean, NULL::int),
  ('free',    'household.members.max',   'LIMIT',   NULL, 2),
  ('free',    'health.documents.max',    'LIMIT',   NULL, 10),
  ('free',    'health.observations.max', 'LIMIT',   NULL, 20),
  ('free',    'memories.entries.max',    'LIMIT',   NULL, 100),
  ('free',    'care.reminders',          'BOOLEAN', false, NULL),
  ('free',    'vet.share',               'BOOLEAN', false, NULL),
  ('free',    'premium.support',         'BOOLEAN', false, NULL),
  ('plus',    'pets.max',                'LIMIT',   NULL, NULL),
  ('plus',    'household.members.max',   'LIMIT',   NULL, 6),
  ('plus',    'health.documents.max',    'LIMIT',   NULL, 100),
  ('plus',    'health.observations.max', 'LIMIT',   NULL, NULL),
  ('plus',    'memories.entries.max',    'LIMIT',   NULL, 1000),
  ('plus',    'care.reminders',          'BOOLEAN', true, NULL),
  ('plus',    'vet.share',               'BOOLEAN', true, NULL),
  ('plus',    'premium.support',         'BOOLEAN', false, NULL),
  ('premium', 'pets.max',                'LIMIT',   NULL, NULL),
  ('premium', 'household.members.max',   'LIMIT',   NULL, NULL),
  ('premium', 'health.documents.max',    'LIMIT',   NULL, NULL),
  ('premium', 'health.observations.max', 'LIMIT',   NULL, NULL),
  ('premium', 'memories.entries.max',    'LIMIT',   NULL, NULL),
  ('premium', 'care.reminders',          'BOOLEAN', true, NULL),
  ('premium', 'vet.share',               'BOOLEAN', true, NULL),
  ('premium', 'premium.support',         'BOOLEAN', true, NULL)
)
INSERT INTO "subscription_plan_entitlements" ("id", "planId", "key", "type", "boolValue", "limitValue", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", c.key, c.type::"SubscriptionEntitlementType", c.bool_value, c.limit_value, now(), now()
FROM catalog c JOIN "subscription_plans" p ON p."code" = c.code
ON CONFLICT ("planId", "key") DO UPDATE SET "type" = EXCLUDED."type", "boolValue" = EXCLUDED."boolValue", "limitValue" = EXCLUDED."limitValue", "updatedAt" = now();

UPDATE "subscription_plan_prices" pr SET "status" = 'INACTIVE', "effectiveTo" = COALESCE(pr."effectiveTo", now()), "updatedAt" = now()
FROM "subscription_plans" p
WHERE pr."planId" = p."id" AND p."code" IN ('plus', 'premium') AND pr."billingInterval" = 'SEMI_ANNUAL' AND pr."status" = 'ACTIVE';

UPDATE "subscription_plans" SET "trialDays" = 7, "updatedAt" = now() WHERE "code" IN ('plus', 'premium') AND ("trialDays" IS NULL OR "trialDays" <> 7);

UPDATE "subscription_plans" SET
  "descriptionFa" = 'پروفایل و پروندهٔ پایهٔ همهٔ حیوانات، بدون محدودیت تعداد. یادآورها و اشتراک با دامپزشک در پلن‌های پولی است.',
  "descriptionEn" = 'Profiles and a basic record for all your pets, with no pet limit. Reminders and vet sharing come with paid plans.',
  "updatedAt" = now()
WHERE "code" = 'free';
UPDATE "subscription_plans" SET
  "descriptionFa" = 'یادآورهای مراقبت و تکرارشونده، اشتراک موقت پرونده با دامپزشک، ۶ عضو خانواده و فضای بیشتر برای اسناد و خاطره‌ها.',
  "descriptionEn" = 'Care and recurring reminders, time-limited vet sharing, 6 household members and more room for documents and memories.',
  "updatedAt" = now()
WHERE "code" = 'plus';
UPDATE "subscription_plans" SET
  "descriptionFa" = 'همهٔ امکانات مراقبت، بدون سقف اسناد، خاطره‌ها و اعضای خانواده، به‌اضافهٔ پشتیبانی ویژه.',
  "descriptionEn" = 'Everything in care, with no cap on documents, memories or household members, plus priority support.',
  "updatedAt" = now()
WHERE "code" = 'premium';
