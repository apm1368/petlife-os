-- CreateEnum
CREATE TYPE "PetLifecycleTransitionSource" AS ENUM ('LOST_PET_INCIDENT', 'MANUAL_MEMORIAL');

-- CreateEnum
CREATE TYPE "LostPetIncidentStatus" AS ENUM ('OPEN', 'SEARCHING', 'SIGHTING_REPORTED', 'FOUND', 'REUNITED', 'CLOSED');

-- CreateEnum
CREATE TYPE "LostPetContactPreference" AS ENUM ('IN_APP_MESSAGE', 'MASKED_CONTACT', 'PUBLIC_CONTACT');

-- CreateEnum
CREATE TYPE "LostPetSightingStatus" AS ENUM ('SUBMITTED', 'REVIEWED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AnimalSupportOrgType" AS ENUM ('NGO', 'SHELTER', 'RESCUE_GROUP');

-- CreateEnum
CREATE TYPE "AnimalSupportVerificationStatus" AS ENUM ('NOT_STARTED', 'SUBMITTED', 'NEEDS_INFORMATION', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RescueCaseStatus" AS ENUM ('OPEN', 'IN_TREATMENT', 'FUNDRAISING', 'READY_FOR_ADOPTION', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CampaignFundType" AS ENUM ('GENERAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "SupportCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "DonationLedgerAccountCode" AS ENUM ('RECEIVABLE', 'DONATION_INCOME_GENERAL', 'DONATION_INCOME_RESTRICTED', 'PAYOUT_PAID', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CommunityPostType" AS ENUM ('GENERAL', 'QUESTION', 'LOCAL', 'LOST_PET_SHARE', 'RESCUE', 'ADOPTION', 'MEMORY');

-- CreateEnum
CREATE TYPE "CommunityContentStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "CommunitySourceType" AS ENUM ('USER', 'LOST_PET_INCIDENT', 'SUPPORT_CAMPAIGN');

-- CreateEnum
CREATE TYPE "CommunityReactionType" AS ENUM ('LIKE', 'LOVE', 'HELPFUL');

-- CreateEnum
CREATE TYPE "CommunityReportReason" AS ENUM ('SPAM', 'ABUSE', 'MISINFORMATION', 'INAPPROPRIATE', 'OTHER');

-- CreateEnum
CREATE TYPE "CommunityReportStatus" AS ENUM ('OPEN', 'ESCALATED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "PetMemoryType" AS ENUM ('PHOTO', 'VIDEO', 'MILESTONE', 'STORY', 'BIRTHDAY', 'FIRST_DAY', 'ADOPTION_DAY', 'TRAVEL', 'ACHIEVEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "PetMemoryVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- AlterEnum
ALTER TYPE "LedgerAccountCode" ADD VALUE 'DONATION_PAYABLE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationCategory" ADD VALUE 'LOST_PET';
ALTER TYPE "NotificationCategory" ADD VALUE 'ANIMAL_SUPPORT';
ALTER TYPE "NotificationCategory" ADD VALUE 'COMMUNITY';

-- CreateTable
CREATE TABLE "pet_lifecycle_transitions" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "fromStatus" "PetLifecycleStatus" NOT NULL,
    "toStatus" "PetLifecycleStatus" NOT NULL,
    "sourceType" "PetLifecycleTransitionSource" NOT NULL,
    "sourceId" TEXT,
    "reason" TEXT,
    "actorUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_lifecycle_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lost_pet_incidents" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "status" "LostPetIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "lastKnownLocation" TEXT,
    "lastKnownLatitude" DOUBLE PRECISION,
    "lastKnownLongitude" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "publicNotes" TEXT,
    "privateNotes" TEXT,
    "primaryPhotoObjectKey" TEXT,
    "contactPreference" "LostPetContactPreference" NOT NULL DEFAULT 'IN_APP_MESSAGE',
    "publicContactMode" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "foundAt" TIMESTAMP(3),
    "reunitedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "lost_pet_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lost_pet_sightings" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "reporterUserId" UUID,
    "reporterContactToken" TEXT,
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "seenAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "photoObjectKey" TEXT,
    "status" "LostPetSightingStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" UUID,

    CONSTRAINT "lost_pet_sightings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_support_organizations" (
    "id" UUID NOT NULL,
    "type" "AnimalSupportOrgType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "verificationStatus" "AnimalSupportVerificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "logoObjectKey" TEXT,
    "imageObjectKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPubliclyListed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animal_support_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rescue_cases" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "animalType" TEXT,
    "status" "RescueCaseStatus" NOT NULL DEFAULT 'OPEN',
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "estimatedNeedIrr" INTEGER,
    "evidenceObjectKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "rescue_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_campaigns" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "rescueCaseId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fundType" "CampaignFundType" NOT NULL DEFAULT 'GENERAL',
    "targetAmountIrr" INTEGER,
    "status" "SupportCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),

    CONSTRAINT "support_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_campaign_updates" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "evidenceObjectKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "postedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_campaign_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_intents" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "donorUserId" UUID,
    "amountIrr" INTEGER NOT NULL,
    "fundType" "CampaignFundType" NOT NULL,
    "status" "DonationStatus" NOT NULL DEFAULT 'PENDING',
    "showDonorPublicly" BOOLEAN NOT NULL DEFAULT false,
    "checkoutId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "succeededAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "donation_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_transactions" (
    "id" UUID NOT NULL,
    "donationIntentId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "amountIrr" INTEGER NOT NULL,
    "fundType" "CampaignFundType" NOT NULL,
    "platformLedgerTransactionId" UUID,
    "donationLedgerTransactionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "donation_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_ledger_accounts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" "DonationLedgerAccountCode" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donation_ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_ledger_transactions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donation_ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_ledger_entries" (
    "id" UUID NOT NULL,
    "donationLedgerTransactionId" UUID NOT NULL,
    "donationLedgerAccountId" UUID NOT NULL,
    "direction" "LedgerEntryDirection" NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donation_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_posts" (
    "id" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "type" "CommunityPostType" NOT NULL DEFAULT 'GENERAL',
    "title" TEXT,
    "body" TEXT NOT NULL,
    "locale" "Locale",
    "countryCode" TEXT,
    "petId" UUID,
    "mediaObjectKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CommunityContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "sourceType" "CommunitySourceType" NOT NULL DEFAULT 'USER',
    "sourceLostPetIncidentId" UUID,
    "sourceSupportCampaignId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_comments" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CommunityContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_reactions" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "CommunityReactionType" NOT NULL DEFAULT 'LIKE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_reports" (
    "id" UUID NOT NULL,
    "postId" UUID,
    "commentId" UUID,
    "reporterUserId" UUID NOT NULL,
    "reason" "CommunityReportReason" NOT NULL,
    "details" TEXT,
    "status" "CommunityReportStatus" NOT NULL DEFAULT 'OPEN',
    "trustCaseId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_memories" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "type" "PetMemoryType" NOT NULL DEFAULT 'PHOTO',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "mediaObjectKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "location" TEXT,
    "visibility" "PetMemoryVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pet_lifecycle_transitions_petId_idx" ON "pet_lifecycle_transitions"("petId");

-- CreateIndex
CREATE INDEX "lost_pet_incidents_petId_idx" ON "lost_pet_incidents"("petId");

-- CreateIndex
CREATE INDEX "lost_pet_incidents_householdId_idx" ON "lost_pet_incidents"("householdId");

-- CreateIndex
CREATE INDEX "lost_pet_incidents_status_idx" ON "lost_pet_incidents"("status");

-- CreateIndex
CREATE INDEX "lost_pet_sightings_incidentId_idx" ON "lost_pet_sightings"("incidentId");

-- CreateIndex
CREATE INDEX "rescue_cases_organizationId_idx" ON "rescue_cases"("organizationId");

-- CreateIndex
CREATE INDEX "rescue_cases_status_idx" ON "rescue_cases"("status");

-- CreateIndex
CREATE INDEX "support_campaigns_organizationId_idx" ON "support_campaigns"("organizationId");

-- CreateIndex
CREATE INDEX "support_campaigns_status_idx" ON "support_campaigns"("status");

-- CreateIndex
CREATE INDEX "support_campaign_updates_campaignId_idx" ON "support_campaign_updates"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "donation_intents_checkoutId_key" ON "donation_intents"("checkoutId");

-- CreateIndex
CREATE UNIQUE INDEX "donation_intents_idempotencyKey_key" ON "donation_intents"("idempotencyKey");

-- CreateIndex
CREATE INDEX "donation_intents_campaignId_idx" ON "donation_intents"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "donation_transactions_donationIntentId_key" ON "donation_transactions"("donationIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "donation_ledger_accounts_organizationId_code_key" ON "donation_ledger_accounts"("organizationId", "code");

-- CreateIndex
CREATE INDEX "donation_ledger_transactions_organizationId_idx" ON "donation_ledger_transactions"("organizationId");

-- CreateIndex
CREATE INDEX "donation_ledger_entries_donationLedgerTransactionId_idx" ON "donation_ledger_entries"("donationLedgerTransactionId");

-- CreateIndex
CREATE INDEX "donation_ledger_entries_donationLedgerAccountId_idx" ON "donation_ledger_entries"("donationLedgerAccountId");

-- CreateIndex
CREATE INDEX "community_posts_authorUserId_idx" ON "community_posts"("authorUserId");

-- CreateIndex
CREATE INDEX "community_posts_status_idx" ON "community_posts"("status");

-- CreateIndex
CREATE INDEX "community_posts_type_idx" ON "community_posts"("type");

-- CreateIndex
CREATE INDEX "community_comments_postId_idx" ON "community_comments"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "community_reactions_postId_userId_key" ON "community_reactions"("postId", "userId");

-- CreateIndex
CREATE INDEX "community_reports_postId_idx" ON "community_reports"("postId");

-- CreateIndex
CREATE INDEX "community_reports_commentId_idx" ON "community_reports"("commentId");

-- CreateIndex
CREATE INDEX "pet_memories_petId_idx" ON "pet_memories"("petId");

-- CreateIndex
CREATE INDEX "pet_memories_householdId_idx" ON "pet_memories"("householdId");

-- AddForeignKey
ALTER TABLE "pet_lifecycle_transitions" ADD CONSTRAINT "pet_lifecycle_transitions_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lost_pet_incidents" ADD CONSTRAINT "lost_pet_incidents_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lost_pet_incidents" ADD CONSTRAINT "lost_pet_incidents_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lost_pet_sightings" ADD CONSTRAINT "lost_pet_sightings_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "lost_pet_incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rescue_cases" ADD CONSTRAINT "rescue_cases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "animal_support_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_campaigns" ADD CONSTRAINT "support_campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "animal_support_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_campaigns" ADD CONSTRAINT "support_campaigns_rescueCaseId_fkey" FOREIGN KEY ("rescueCaseId") REFERENCES "rescue_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_campaign_updates" ADD CONSTRAINT "support_campaign_updates_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "support_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_intents" ADD CONSTRAINT "donation_intents_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "support_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_transactions" ADD CONSTRAINT "donation_transactions_donationIntentId_fkey" FOREIGN KEY ("donationIntentId") REFERENCES "donation_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_transactions" ADD CONSTRAINT "donation_transactions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "support_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_transactions" ADD CONSTRAINT "donation_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "animal_support_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_ledger_accounts" ADD CONSTRAINT "donation_ledger_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "animal_support_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_ledger_transactions" ADD CONSTRAINT "donation_ledger_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "animal_support_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_ledger_entries" ADD CONSTRAINT "donation_ledger_entries_donationLedgerTransactionId_fkey" FOREIGN KEY ("donationLedgerTransactionId") REFERENCES "donation_ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_ledger_entries" ADD CONSTRAINT "donation_ledger_entries_donationLedgerAccountId_fkey" FOREIGN KEY ("donationLedgerAccountId") REFERENCES "donation_ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_reactions" ADD CONSTRAINT "community_reactions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "community_comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_memories" ADD CONSTRAINT "pet_memories_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_memories" ADD CONSTRAINT "pet_memories_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A pet may have more than one Lost Pet incident over its lifetime (lost
-- more than once), but never more than one open at a time — a partial
-- unique index (state-aware, so a plain unique column can't express it),
-- mirroring the schema-hardening migration's own partial-unique-index
-- precedent. LostPetIncidentService's own pre-check exists purely to give
-- a friendlier typed error than this raw constraint violation.
CREATE UNIQUE INDEX "lost_pet_incidents_one_open_per_pet" ON "lost_pet_incidents"("petId") WHERE "status" NOT IN ('REUNITED', 'CLOSED');

-- A sighting can only be marked FOUND after being reported, but the state
-- machine itself (LostPetIncidentService) is what actually enforces
-- OPEN->SEARCHING->...->REUNITED order; this is just the one cross-field
-- invariant worth a DB-level backstop: you cannot be REUNITED without
-- having first been FOUND.
ALTER TABLE "lost_pet_incidents" ADD CONSTRAINT "lost_pet_incidents_reunited_requires_found" CHECK ("reunitedAt" IS NULL OR "foundAt" IS NOT NULL);

ALTER TABLE "lost_pet_incidents" ADD CONSTRAINT "lost_pet_incidents_no_impossible_timestamps" CHECK (
  ("foundAt" IS NULL OR "foundAt" >= "createdAt") AND
  ("reunitedAt" IS NULL OR "foundAt" IS NULL OR "reunitedAt" >= "foundAt") AND
  ("closedAt" IS NULL OR "closedAt" >= "createdAt")
);

ALTER TABLE "pet_lifecycle_transitions" ADD CONSTRAINT "pet_lifecycle_transitions_from_ne_to" CHECK ("fromStatus" != "toStatus");

-- A CommunityReport must target either a post or a comment, never neither
-- (a report with both set is a comment-level report on that post, allowed).
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_target_present" CHECK ("postId" IS NOT NULL OR "commentId" IS NOT NULL);

ALTER TABLE "donation_intents" ADD CONSTRAINT "donation_intents_amount_positive" CHECK ("amountIrr" > 0);

ALTER TABLE "donation_transactions" ADD CONSTRAINT "donation_transactions_amount_positive" CHECK ("amountIrr" > 0);

ALTER TABLE "donation_ledger_entries" ADD CONSTRAINT "donation_ledger_entries_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "rescue_cases" ADD CONSTRAINT "rescue_cases_no_impossible_timestamps" CHECK ("closedAt" IS NULL OR "closedAt" >= "createdAt");

ALTER TABLE "support_campaigns" ADD CONSTRAINT "support_campaigns_no_impossible_date_range" CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" >= "startsAt");
