-- CreateEnum
CREATE TYPE "SubscriptionPlanStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "SubscriptionPlanPriceStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SubscriptionBillingInterval" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SubscriptionEntitlementType" AS ENUM ('BOOLEAN', 'LIMIT');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'CANCEL_AT_PERIOD_END', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionPeriodStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "SubscriptionChangeType" AS ENUM ('TRIAL_STARTED', 'INITIAL_PURCHASE', 'UPGRADE', 'DOWNGRADE_SCHEDULED', 'DOWNGRADE_APPLIED', 'CANCEL_SCHEDULED', 'CANCEL_REVERSED', 'RENEWED', 'PAST_DUE', 'GRACE_STARTED', 'EXPIRED', 'ADMIN_CANCELLED', 'ENTITLEMENT_OVERRIDE_GRANTED', 'ENTITLEMENT_OVERRIDE_REVOKED');

-- CreateEnum
CREATE TYPE "SubscriptionBillingReason" AS ENUM ('INITIAL', 'RENEWAL', 'UPGRADE');

-- CreateEnum
CREATE TYPE "SubscriptionBillingAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'SUBSCRIPTION';

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionFa" TEXT,
    "descriptionEn" TEXT,
    "status" "SubscriptionPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "trialDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plan_countries" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "countryCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_plan_countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plan_prices" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "countryCode" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "billingInterval" "SubscriptionBillingInterval" NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "SubscriptionPlanPriceStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plan_entitlements" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "type" "SubscriptionEntitlementType" NOT NULL,
    "boolValue" BOOLEAN,
    "limitValue" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plan_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "priceId" UUID,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodId" UUID,
    "pendingPlanId" UUID,
    "pendingPriceId" UUID,
    "trialEndsAt" TIMESTAMP(3),
    "gracePeriodEndsAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "cancelEffectiveAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_periods" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "priceId" UUID,
    "status" "SubscriptionPeriodStatus" NOT NULL DEFAULT 'ACTIVE',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "isTrial" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_billing_attempts" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "periodId" UUID,
    "priceId" UUID,
    "reason" "SubscriptionBillingReason" NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "paymentIntentId" UUID,
    "idempotencyKey" TEXT,
    "status" "SubscriptionBillingAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "failureCode" TEXT,
    "failureReason" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "subscription_billing_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_changes" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "type" "SubscriptionChangeType" NOT NULL,
    "fromPlanId" UUID,
    "toPlanId" UUID,
    "effectiveAt" TIMESTAMP(3),
    "note" TEXT,
    "initiatedByUserId" UUID,
    "initiatedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_trials" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_trials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_entitlement_overrides" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "type" "SubscriptionEntitlementType" NOT NULL,
    "boolValue" BOOLEAN,
    "limitValue" INTEGER,
    "reason" TEXT NOT NULL,
    "createdByAdminId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_entitlement_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plan_countries_planId_countryCode_key" ON "subscription_plan_countries"("planId", "countryCode");

-- CreateIndex
CREATE INDEX "subscription_plan_prices_planId_countryCode_billingInterval_idx" ON "subscription_plan_prices"("planId", "countryCode", "billingInterval", "status");

-- Hand-appended: Prisma's DSL cannot express "at most one ACTIVE price per
-- (plan, country, interval)" as a `@@unique` (it would need a partial index
-- with a WHERE clause) — see SubscriptionPlanPrice's own doc comment in
-- schema.prisma. Mirrors the exact "documented exception, raw SQL in the
-- migration only" precedent Handoff 01's users contact-info CHECK and
-- Handoff 14's seller_settlements_approver_not_initiator CHECK constraint
-- already established.
CREATE UNIQUE INDEX "subscription_plan_prices_active_unique" ON "subscription_plan_prices"("planId", "countryCode", "billingInterval") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plan_entitlements_planId_key_key" ON "subscription_plan_entitlements"("planId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_householdId_key" ON "subscriptions"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_currentPeriodId_key" ON "subscriptions"("currentPeriodId");

-- CreateIndex
CREATE INDEX "subscription_periods_subscriptionId_status_idx" ON "subscription_periods"("subscriptionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_billing_attempts_idempotencyKey_key" ON "subscription_billing_attempts"("idempotencyKey");

-- CreateIndex
CREATE INDEX "subscription_billing_attempts_subscriptionId_createdAt_idx" ON "subscription_billing_attempts"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "subscription_changes_subscriptionId_createdAt_idx" ON "subscription_changes"("subscriptionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_trials_householdId_planId_key" ON "subscription_trials"("householdId", "planId");

-- CreateIndex
CREATE INDEX "subscription_entitlement_overrides_householdId_key_idx" ON "subscription_entitlement_overrides"("householdId", "key");

-- AddForeignKey
ALTER TABLE "subscription_plan_countries" ADD CONSTRAINT "subscription_plan_countries_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_plan_prices" ADD CONSTRAINT "subscription_plan_prices_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_plan_entitlements" ADD CONSTRAINT "subscription_plan_entitlements_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "subscription_plan_prices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_currentPeriodId_fkey" FOREIGN KEY ("currentPeriodId") REFERENCES "subscription_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pendingPlanId_fkey" FOREIGN KEY ("pendingPlanId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pendingPriceId_fkey" FOREIGN KEY ("pendingPriceId") REFERENCES "subscription_plan_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "subscription_plan_prices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_billing_attempts" ADD CONSTRAINT "subscription_billing_attempts_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_billing_attempts" ADD CONSTRAINT "subscription_billing_attempts_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "subscription_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_billing_attempts" ADD CONSTRAINT "subscription_billing_attempts_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "subscription_plan_prices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_billing_attempts" ADD CONSTRAINT "subscription_billing_attempts_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_changes" ADD CONSTRAINT "subscription_changes_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_changes" ADD CONSTRAINT "subscription_changes_fromPlanId_fkey" FOREIGN KEY ("fromPlanId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_changes" ADD CONSTRAINT "subscription_changes_toPlanId_fkey" FOREIGN KEY ("toPlanId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_changes" ADD CONSTRAINT "subscription_changes_initiatedByAdminId_fkey" FOREIGN KEY ("initiatedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_trials" ADD CONSTRAINT "subscription_trials_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_trials" ADD CONSTRAINT "subscription_trials_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_trials" ADD CONSTRAINT "subscription_trials_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_entitlement_overrides" ADD CONSTRAINT "subscription_entitlement_overrides_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_entitlement_overrides" ADD CONSTRAINT "subscription_entitlement_overrides_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

