-- Additive reminder scheduling; does not rewrite clinical or booking tables.
CREATE TABLE "care_reminders" (
  "id" UUID NOT NULL,
  "petId" UUID NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'USER_CREATED',
  "sourceId" UUID,
  "originalDueAt" TIMESTAMP(3) NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "snoozedUntil" TIMESTAMP(3),
  "state" TEXT NOT NULL DEFAULT 'UPCOMING',
  "recurrence" TEXT NOT NULL DEFAULT 'ONCE',
  "intervalDays" INTEGER,
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "notifiedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "parentId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "care_reminders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "care_reminders_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "care_reminders_state_check" CHECK ("state" IN ('UPCOMING','DUE','OVERDUE','COMPLETED','SNOOZED','CANCELLED')),
  CONSTRAINT "care_reminders_source_check" CHECK ("source" IN ('USER_CREATED','PROVIDER_CREATED','MEDICAL_RECORD_DERIVED','BOOKING_DERIVED','SYSTEM_SCHEDULED')),
  CONSTRAINT "care_reminders_recurrence_check" CHECK ("recurrence" IN ('ONCE','DAILY','WEEKLY','MONTHLY','YEARLY','CUSTOM')),
  CONSTRAINT "care_reminders_interval_check" CHECK ("recurrence" != 'CUSTOM' OR ("intervalDays" IS NOT NULL AND "intervalDays" BETWEEN 1 AND 3650))
);
CREATE UNIQUE INDEX "care_reminders_parentId_originalDueAt_key" ON "care_reminders"("parentId", "originalDueAt");
CREATE INDEX "care_reminders_petId_dueAt_idx" ON "care_reminders"("petId", "dueAt");
CREATE INDEX "care_reminders_state_dueAt_idx" ON "care_reminders"("state", "dueAt");
