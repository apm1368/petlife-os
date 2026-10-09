-- Canonical Batch 1: account, privacy and household collaboration.
-- Additive only. Existing users, sessions, households and access grants are preserved.

CREATE TYPE "HouseholdInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'COMPLETED', 'CANCELLED', 'FAILED');
CREATE TYPE "ConsentKind" AS ENUM ('TERMS', 'PRIVACY', 'MARKETING');

ALTER TABLE "sessions"
  ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "revokedAt" TIMESTAMP(3);

CREATE TABLE "household_invitations" (
  "id" UUID NOT NULL,
  "householdId" UUID NOT NULL,
  "contact" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "HouseholdInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "invitedByUserId" UUID NOT NULL,
  "acceptedByUserId" UUID,
  "initialAccess" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "household_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_consents" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "kind" "ConsentKind" NOT NULL,
  "version" TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_export_requests" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'PENDING',
  "scope" JSONB NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readyAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  CONSTRAINT "data_export_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "account_deletion_requests" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "household_invitations_tokenHash_key" ON "household_invitations"("tokenHash");
CREATE INDEX "household_invitations_householdId_status_idx" ON "household_invitations"("householdId", "status");
CREATE INDEX "household_invitations_contact_status_idx" ON "household_invitations"("contact", "status");
CREATE UNIQUE INDEX "user_consents_userId_kind_version_key" ON "user_consents"("userId", "kind", "version");
CREATE INDEX "user_consents_userId_kind_idx" ON "user_consents"("userId", "kind");
CREATE INDEX "data_export_requests_userId_requestedAt_idx" ON "data_export_requests"("userId", "requestedAt");
CREATE INDEX "account_deletion_requests_userId_requestedAt_idx" ON "account_deletion_requests"("userId", "requestedAt");

ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
