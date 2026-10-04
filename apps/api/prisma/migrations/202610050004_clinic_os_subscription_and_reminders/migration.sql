-- CreateEnum
CREATE TYPE "ClinicPlanStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ClinicReminderKind" AS ENUM ('VACCINATION', 'CHECKUP', 'MEDICATION', 'FOLLOW_UP', 'MESSAGE');

-- CreateEnum
CREATE TYPE "ClinicReminderStatus" AS ENUM ('SCHEDULED', 'SENT', 'CANCELLED', 'FAILED');


-- CreateTable
CREATE TABLE "clinic_plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionFa" TEXT,
    "descriptionEn" TEXT,
    "status" "ClinicPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_plan_entitlements" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "type" "SubscriptionEntitlementType" NOT NULL,
    "boolValue" BOOLEAN,
    "limitValue" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_plan_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_plan_prices" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "billingInterval" "SubscriptionBillingInterval" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "status" "SubscriptionPlanPriceStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_subscriptions" (
    "id" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_subscription_changes" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "type" "SubscriptionChangeType" NOT NULL,
    "fromPlanCode" TEXT,
    "toPlanCode" TEXT NOT NULL,
    "actorAdminUserId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_subscription_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_reminders" (
    "id" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "createdByProviderUserId" UUID NOT NULL,
    "kind" "ClinicReminderKind" NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "ClinicReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "sentAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinic_plans_code_key" ON "clinic_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_plan_entitlements_planId_key_key" ON "clinic_plan_entitlements"("planId", "key");

-- CreateIndex
CREATE INDEX "clinic_plan_prices_planId_billingInterval_status_idx" ON "clinic_plan_prices"("planId", "billingInterval", "status");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_subscriptions_providerOrganizationId_key" ON "clinic_subscriptions"("providerOrganizationId");

-- CreateIndex
CREATE INDEX "clinic_subscription_changes_subscriptionId_createdAt_idx" ON "clinic_subscription_changes"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "clinic_reminders_status_dueAt_idx" ON "clinic_reminders"("status", "dueAt");

-- CreateIndex
CREATE INDEX "clinic_reminders_providerOrganizationId_dueAt_idx" ON "clinic_reminders"("providerOrganizationId", "dueAt");

-- CreateIndex
CREATE INDEX "clinic_reminders_petId_idx" ON "clinic_reminders"("petId");

-- AddForeignKey
ALTER TABLE "clinic_plan_entitlements" ADD CONSTRAINT "clinic_plan_entitlements_planId_fkey" FOREIGN KEY ("planId") REFERENCES "clinic_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_plan_prices" ADD CONSTRAINT "clinic_plan_prices_planId_fkey" FOREIGN KEY ("planId") REFERENCES "clinic_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_subscriptions" ADD CONSTRAINT "clinic_subscriptions_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_subscriptions" ADD CONSTRAINT "clinic_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "clinic_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_subscription_changes" ADD CONSTRAINT "clinic_subscription_changes_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "clinic_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_reminders" ADD CONSTRAINT "clinic_reminders_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_reminders" ADD CONSTRAINT "clinic_reminders_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity the Prisma DSL cannot express.
ALTER TABLE "clinic_plan_entitlements" ADD CONSTRAINT "clinic_plan_entitlements_value_shape" CHECK (
  ("type" = 'BOOLEAN' AND "boolValue" IS NOT NULL AND "limitValue" IS NULL) OR
  ("type" = 'LIMIT' AND "boolValue" IS NULL AND ("limitValue" IS NULL OR "limitValue" >= 0)));
ALTER TABLE "clinic_plan_prices" ADD CONSTRAINT "clinic_plan_prices_amount_positive" CHECK ("amount" > 0);
CREATE UNIQUE INDEX "clinic_plan_prices_one_active" ON "clinic_plan_prices" ("planId", "billingInterval") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "clinic_plans_one_default" ON "clinic_plans" ("isDefault") WHERE "isDefault";
ALTER TABLE "clinic_reminders" ADD CONSTRAINT "clinic_reminders_title_len" CHECK (char_length(btrim("title")) BETWEEN 1 AND 120);
ALTER TABLE "clinic_reminders" ADD CONSTRAINT "clinic_reminders_note_len" CHECK ("note" IS NULL OR char_length("note") <= 1000);

-- The three clinic plans and their entitlements (configuration, not demo data). No prices: clinic
-- pricing is an owner decision, so nothing is purchasable until a price row is added by an admin.
INSERT INTO "clinic_plans" ("id", "code", "nameFa", "nameEn", "descriptionFa", "descriptionEn", "sortOrder", "isDefault", "updatedAt") VALUES
  ('c1a10000-0000-4000-8000-000000000001', 'CLINIC_BASIC', 'کلینیک پایه', 'Clinic Basic', 'پرونده‌ی بیماران، نوبت‌دهی و فهرست مشتریان.', 'Patient records, appointments and the customer list.', 1, true, now()),
  ('c1a10000-0000-4000-8000-000000000002', 'CLINIC_GROWTH', 'کلینیک رشد', 'Clinic Growth', 'همه‌ی امکانات پایه به‌علاوه‌ی یادآور و پیام به صاحبان و گزارش مالی.', 'Everything in Basic plus owner reminders, messages and finance reports.', 2, false, now()),
  ('c1a10000-0000-4000-8000-000000000003', 'CLINIC_PRO', 'کلینیک حرفه‌ای', 'Clinic Pro', 'همه‌ی امکانات رشد بدون سقف ماهانه‌ی یادآور.', 'Everything in Growth with no monthly reminder cap.', 3, false, now());

INSERT INTO "clinic_plan_entitlements" ("id", "planId", "key", "type", "boolValue", "limitValue", "updatedAt")
SELECT gen_random_uuid(), p."id", e.key, e.type::"SubscriptionEntitlementType", e.b, e.l, now()
FROM "clinic_plans" p
JOIN (VALUES
  ('CLINIC_BASIC',  'clinic.patients',               'BOOLEAN', true,  NULL::int),
  ('CLINIC_BASIC',  'clinic.appointments',           'BOOLEAN', true,  NULL),
  ('CLINIC_BASIC',  'clinic.medical_records',        'BOOLEAN', true,  NULL),
  ('CLINIC_BASIC',  'clinic.customers',              'BOOLEAN', true,  NULL),
  ('CLINIC_BASIC',  'clinic.reminders',              'BOOLEAN', false, NULL),
  ('CLINIC_BASIC',  'clinic.finance.reports',        'BOOLEAN', false, NULL),
  ('CLINIC_GROWTH', 'clinic.patients',               'BOOLEAN', true,  NULL),
  ('CLINIC_GROWTH', 'clinic.appointments',           'BOOLEAN', true,  NULL),
  ('CLINIC_GROWTH', 'clinic.medical_records',        'BOOLEAN', true,  NULL),
  ('CLINIC_GROWTH', 'clinic.customers',              'BOOLEAN', true,  NULL),
  ('CLINIC_GROWTH', 'clinic.reminders',              'BOOLEAN', true,  NULL),
  ('CLINIC_GROWTH', 'clinic.reminders.monthly.max',  'LIMIT',   NULL,  300),
  ('CLINIC_GROWTH', 'clinic.finance.reports',        'BOOLEAN', true,  NULL),
  ('CLINIC_PRO',    'clinic.patients',               'BOOLEAN', true,  NULL),
  ('CLINIC_PRO',    'clinic.appointments',           'BOOLEAN', true,  NULL),
  ('CLINIC_PRO',    'clinic.medical_records',        'BOOLEAN', true,  NULL),
  ('CLINIC_PRO',    'clinic.customers',              'BOOLEAN', true,  NULL),
  ('CLINIC_PRO',    'clinic.reminders',              'BOOLEAN', true,  NULL),
  ('CLINIC_PRO',    'clinic.reminders.monthly.max',  'LIMIT',   NULL,  NULL),
  ('CLINIC_PRO',    'clinic.finance.reports',        'BOOLEAN', true,  NULL)
) AS e(code, key, type, b, l) ON e.code = p."code";
