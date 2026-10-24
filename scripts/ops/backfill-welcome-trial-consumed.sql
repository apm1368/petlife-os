-- Decision 4 — OPTIONAL BACKFILL, owner-approved only. Sets ONLY the new nullable columns from existing trial
-- history; never touches subscriptions, trials or anything else, and never overwrites a value already set.
-- Idempotent. Not required for correctness (see report-welcome-trial-consumed.sql).
BEGIN;
UPDATE households h SET "welcomeTrialConsumedAt" = s.first_trial_at
FROM (SELECT "householdId", min("startAt") AS first_trial_at FROM subscription_trials GROUP BY "householdId") s
WHERE h.id = s."householdId" AND h."welcomeTrialConsumedAt" IS NULL;
UPDATE users u SET "welcomeTrialConsumedAt" = s.first_trial_at
FROM (SELECT "initiatedByUserId" AS user_id, min("effectiveAt") AS first_trial_at FROM subscription_changes
      WHERE type = 'TRIAL_STARTED' AND "initiatedByUserId" IS NOT NULL GROUP BY "initiatedByUserId") s
WHERE u.id = s.user_id AND u."welcomeTrialConsumedAt" IS NULL;
COMMIT;
