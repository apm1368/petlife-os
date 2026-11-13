-- Membership free week + first-purchase gift (owner request 2026-11-13). Additive only: one enum value, one column
-- with a default, two new tables. Nothing changes for existing rows; the gift stays off until an admin enables it.

-- AlterEnum: the member ended their trial early (access ends at once; the trial still counts as used).
ALTER TYPE "SubscriptionChangeType" ADD VALUE 'TRIAL_ENDED_EARLY';

-- AlterTable: the first-purchase gift taken off the list price of a billing attempt (0 = none).
ALTER TABLE "subscription_billing_attempts" ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: one row per redeemed first-purchase gift; single use per household and per account.
CREATE TABLE "subscription_gift_redemptions" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "billingAttemptId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "percentOff" INTEGER NOT NULL,
    "listAmount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL,
    "chargedAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_gift_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_gift_redemptions_householdId_key" ON "subscription_gift_redemptions"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_gift_redemptions_userId_key" ON "subscription_gift_redemptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_gift_redemptions_billingAttemptId_key" ON "subscription_gift_redemptions"("billingAttemptId");

-- CreateTable: one trial per verified phone, stored as a keyed hash only.
CREATE TABLE "subscription_trial_phone_claims" (
    "phoneHash" TEXT NOT NULL,
    "userId" UUID,
    "householdId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_trial_phone_claims_pkey" PRIMARY KEY ("phoneHash")
);
