-- Decision 4 (welcome trial: one per user AND per household, lifetime, plan-independent).
-- Additive only: two nullable columns, no backfill. Trials started before this migration are still recognised
-- as consumed through subscription_trials / subscription_changes (see SubscriptionService.startTrial).
ALTER TABLE "users" ADD COLUMN "welcomeTrialConsumedAt" TIMESTAMP(3);
ALTER TABLE "households" ADD COLUMN "welcomeTrialConsumedAt" TIMESTAMP(3);
