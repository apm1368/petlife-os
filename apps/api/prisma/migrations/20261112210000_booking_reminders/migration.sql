-- Automatic appointment reminders (24h and 2h before) and the owner's "I'll be there" confirmation.
ALTER TABLE "bookings" ADD COLUMN "reminder24hSentAt" TIMESTAMP(3), ADD COLUMN "reminder2hSentAt" TIMESTAMP(3), ADD COLUMN "attendanceConfirmedAt" TIMESTAMP(3);
CREATE INDEX "bookings_reminders_due_idx" ON "bookings"("startAt") WHERE "bookingStatus" = 'CONFIRMED' AND ("reminder24hSentAt" IS NULL OR "reminder2hSentAt" IS NULL);
