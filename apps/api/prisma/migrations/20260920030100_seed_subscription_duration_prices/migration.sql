UPDATE "subscription_plans"
SET "trialDays" = 7, "updatedAt" = NOW()
WHERE "isFree" = FALSE AND "status" = 'ACTIVE';

INSERT INTO "subscription_plan_prices" (
  "id", "planId", "countryCode", "currency", "billingInterval", "amount",
  "status", "effectiveFrom", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), monthly."planId", monthly."countryCode", monthly."currency",
       'QUARTERLY'::"SubscriptionBillingInterval",
       ROUND(monthly."amount" * 2.82)::INTEGER,
       'ACTIVE', NOW(), NOW(), NOW()
FROM "subscription_plan_prices" monthly
WHERE monthly."billingInterval" = 'MONTHLY'
  AND monthly."status" = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM "subscription_plan_prices" existing
    WHERE existing."planId" = monthly."planId"
      AND existing."countryCode" = monthly."countryCode"
      AND existing."billingInterval" = 'QUARTERLY'
      AND existing."status" = 'ACTIVE'
  );

INSERT INTO "subscription_plan_prices" (
  "id", "planId", "countryCode", "currency", "billingInterval", "amount",
  "status", "effectiveFrom", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), monthly."planId", monthly."countryCode", monthly."currency",
       'SEMI_ANNUAL'::"SubscriptionBillingInterval",
       ROUND(monthly."amount" * 5.34)::INTEGER,
       'ACTIVE', NOW(), NOW(), NOW()
FROM "subscription_plan_prices" monthly
WHERE monthly."billingInterval" = 'MONTHLY'
  AND monthly."status" = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM "subscription_plan_prices" existing
    WHERE existing."planId" = monthly."planId"
      AND existing."countryCode" = monthly."countryCode"
      AND existing."billingInterval" = 'SEMI_ANNUAL'
      AND existing."status" = 'ACTIVE'
  );
