-- Decision 4 — REPORT (read-only): households and users that already started a trial before the
-- welcomeTrialConsumedAt columns existed. They are already treated as consumed by SubscriptionService.startTrial
-- (it also reads subscription_trials / TRIAL_STARTED history), so no backfill is needed for correctness.
--   docker exec -i petlife-os-postgres-1 psql -U petlife -d petlife_os < scripts/ops/report-welcome-trial-consumed.sql
-- The optional backfill (only the new columns, nothing else) is scripts/ops/backfill-welcome-trial-consumed.sql;
-- run it only with the owner's OK.

\echo '== households with a past trial but welcomeTrialConsumedAt NULL'
SELECT h.id AS household_id, min(t."startAt") AS first_trial_at, count(*) AS trials
FROM households h JOIN subscription_trials t ON t."householdId" = h.id
WHERE h."welcomeTrialConsumedAt" IS NULL
GROUP BY h.id ORDER BY first_trial_at;

\echo '== users who started a trial but welcomeTrialConsumedAt NULL'
SELECT u.id AS user_id, min(c."effectiveAt") AS first_trial_at, count(*) AS trials
FROM users u JOIN subscription_changes c ON c."initiatedByUserId" = u.id AND c.type = 'TRIAL_STARTED'
WHERE u."welcomeTrialConsumedAt" IS NULL
GROUP BY u.id ORDER BY first_trial_at;
