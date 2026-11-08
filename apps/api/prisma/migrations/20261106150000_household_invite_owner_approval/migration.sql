ALTER TYPE "HouseholdInvitationStatus" ADD VALUE 'REQUESTED';

ALTER TABLE "household_invitations"
  ADD COLUMN "requestedByUserId" UUID,
  ADD COLUMN "reviewedByUserId" UUID,
  ADD COLUMN "requestedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3);

ALTER TABLE "household_invitations"
  ADD CONSTRAINT "household_invitations_requestedByUserId_fkey"
    FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "household_invitations_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "household_invitations_requestedByUserId_idx"
  ON "household_invitations"("requestedByUserId");
