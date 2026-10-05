-- Owner-approved clinic seat and branch limits (2026-10-05). LIMIT with NULL = unlimited.
INSERT INTO "clinic_plan_entitlements" ("id", "planId", "key", "type", "boolValue", "limitValue", "updatedAt")
SELECT gen_random_uuid(), p."id", e.key, 'LIMIT'::"SubscriptionEntitlementType", NULL, e.l, now()
FROM "clinic_plans" p
JOIN (VALUES
  ('CLINIC_BASIC',  'clinic.staff.max',    3),
  ('CLINIC_BASIC',  'clinic.branches.max', 1),
  ('CLINIC_GROWTH', 'clinic.staff.max',    10),
  ('CLINIC_GROWTH', 'clinic.branches.max', 3),
  ('CLINIC_PRO',    'clinic.staff.max',    NULL::int),
  ('CLINIC_PRO',    'clinic.branches.max', NULL::int)
) AS e(code, key, l) ON e.code = p."code"
ON CONFLICT ("planId", "key") DO UPDATE SET "limitValue" = EXCLUDED."limitValue", "type" = EXCLUDED."type", "boolValue" = NULL, "updatedAt" = now();
