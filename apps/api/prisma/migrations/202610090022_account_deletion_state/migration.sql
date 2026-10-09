-- CreateEnum
CREATE TYPE "AccountDeletionState" AS ENUM ('REQUESTED', 'CANCELLED', 'PENDING_RETENTION', 'READY_FOR_EXECUTION', 'COMPLETED');

-- AlterTable
ALTER TABLE "account_deletion_requests" ADD COLUMN     "state" "AccountDeletionState" NOT NULL DEFAULT 'REQUESTED',
ADD COLUMN     "stateChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "stateNote" TEXT;


-- Existing requests keep their meaning.
UPDATE "account_deletion_requests" SET "state" = 'CANCELLED' WHERE "status" = 'CANCELLED';
UPDATE "account_deletion_requests" SET "state" = 'COMPLETED' WHERE "status" = 'COMPLETED';
