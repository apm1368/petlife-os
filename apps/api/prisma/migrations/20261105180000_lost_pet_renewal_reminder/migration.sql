-- LP-06: exactly one operational reminder for an incident that remains
-- publicly active after 30 days.  This is not a user balance or a derived
-- status; it is a delivery marker used for idempotency across worker retries.
ALTER TABLE "lost_pet_incidents"
  ADD COLUMN "renewalReminderSentAt" TIMESTAMP(3);

CREATE INDEX "lost_pet_incidents_renewalReminderSentAt_idx"
  ON "lost_pet_incidents"("renewalReminderSentAt");
