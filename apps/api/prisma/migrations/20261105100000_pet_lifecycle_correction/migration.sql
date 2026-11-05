-- PT-03: retain the original lifecycle fact and append an explicit correction
-- instead of rewriting or deleting history.
ALTER TYPE "PetLifecycleTransitionSource" ADD VALUE IF NOT EXISTS 'MANUAL_CORRECTION';

-- PT-12: pausing care after a deceased state must be reversible if the
-- lifecycle fact is corrected. The original reminder state is retained.
ALTER TABLE "care_reminders"
  ADD COLUMN "lifecycleSuspendedAt" TIMESTAMP(3),
  ADD COLUMN "lifecycleSuspendedState" TEXT;
