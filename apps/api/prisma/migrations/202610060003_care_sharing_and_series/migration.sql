
-- AlterTable
ALTER TABLE "care_reminders" ADD COLUMN     "assignedToUserId" UUID,
ADD COLUMN     "completedByUserId" UUID,
ADD COLUMN     "maxOccurrences" INTEGER,
ADD COLUMN     "occurrenceIndex" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "skippedAt" TIMESTAMP(3),
ADD COLUMN     "untilDate" TIMESTAMP(3),
ADD COLUMN     "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];


ALTER TABLE "care_reminders" ADD CONSTRAINT "care_reminders_series_bounds" CHECK (
  ("maxOccurrences" IS NULL OR "maxOccurrences" BETWEEN 1 AND 1000) AND "occurrenceIndex" >= 1 AND
  "weekdays" <@ ARRAY[0,1,2,3,4,5,6]);
CREATE INDEX "care_reminders_assignee_idx" ON "care_reminders" ("assignedToUserId") WHERE "assignedToUserId" IS NOT NULL;

-- WEEKDAYS recurrence and the SKIPPED state.
ALTER TABLE "care_reminders" DROP CONSTRAINT "care_reminders_recurrence_check";
ALTER TABLE "care_reminders" ADD CONSTRAINT "care_reminders_recurrence_check" CHECK ("recurrence" IN ('ONCE', 'DAILY', 'WEEKLY', 'WEEKDAYS', 'MONTHLY', 'YEARLY', 'CUSTOM'));
ALTER TABLE "care_reminders" ADD CONSTRAINT "care_reminders_weekdays_required" CHECK ("recurrence" <> 'WEEKDAYS' OR cardinality("weekdays") > 0);
ALTER TABLE "care_reminders" DROP CONSTRAINT "care_reminders_state_check";
ALTER TABLE "care_reminders" ADD CONSTRAINT "care_reminders_state_check" CHECK ("state" IN ('UPCOMING', 'DUE', 'OVERDUE', 'COMPLETED', 'SNOOZED', 'CANCELLED', 'SKIPPED'));
