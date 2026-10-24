-- CreateEnum
CREATE TYPE "ClinicTaskType" AS ENUM ('CALL_CUSTOMER', 'FOLLOW_UP_LAB', 'CONFIRM_APPOINTMENT', 'COLLECT_PAYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ClinicTaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClinicCampaignSegment" AS ENUM ('APPOINTMENTS_TOMORROW', 'VACCINES_DUE', 'FOLLOW_UP_DUE');


-- CreateTable
CREATE TABLE "clinic_customer_notes" (
    "id" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "authorProviderUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "visibleToOwner" BOOLEAN NOT NULL DEFAULT false,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_customer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_customer_tags" (
    "id" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_customer_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_customer_tag_assignments" (
    "tagId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_customer_tag_assignments_pkey" PRIMARY KEY ("tagId","householdId")
);

-- CreateTable
CREATE TABLE "clinic_tasks" (
    "id" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "type" "ClinicTaskType" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ClinicTaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "assigneeProviderUserId" UUID,
    "householdId" UUID,
    "bookingId" UUID,
    "createdByProviderUserId" UUID NOT NULL,
    "completedByProviderUserId" UUID,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_campaigns" (
    "id" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "segment" "ClinicCampaignSegment" NOT NULL,
    "dayKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "createdByProviderUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_imported_contacts" (
    "id" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "petName" TEXT,
    "species" TEXT,
    "notes" TEXT,
    "importBatchId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_imported_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinic_customer_notes_providerOrganizationId_householdId_idx" ON "clinic_customer_notes"("providerOrganizationId", "householdId");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_customer_tags_providerOrganizationId_name_key" ON "clinic_customer_tags"("providerOrganizationId", "name");

-- CreateIndex
CREATE INDEX "clinic_customer_tag_assignments_householdId_idx" ON "clinic_customer_tag_assignments"("householdId");

-- CreateIndex
CREATE INDEX "clinic_tasks_providerOrganizationId_status_dueAt_idx" ON "clinic_tasks"("providerOrganizationId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_campaigns_providerOrganizationId_segment_dayKey_key" ON "clinic_campaigns"("providerOrganizationId", "segment", "dayKey");

-- CreateIndex
CREATE INDEX "clinic_imported_contacts_providerOrganizationId_idx" ON "clinic_imported_contacts"("providerOrganizationId");

-- AddForeignKey
ALTER TABLE "clinic_customer_notes" ADD CONSTRAINT "clinic_customer_notes_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_customer_tags" ADD CONSTRAINT "clinic_customer_tags_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_customer_tag_assignments" ADD CONSTRAINT "clinic_customer_tag_assignments_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "clinic_customer_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_tasks" ADD CONSTRAINT "clinic_tasks_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_campaigns" ADD CONSTRAINT "clinic_campaigns_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_imported_contacts" ADD CONSTRAINT "clinic_imported_contacts_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "clinic_customer_notes" ADD CONSTRAINT "clinic_customer_notes_len" CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000);
ALTER TABLE "clinic_customer_tags" ADD CONSTRAINT "clinic_customer_tags_name_len" CHECK (char_length(btrim("name")) BETWEEN 1 AND 40);
ALTER TABLE "clinic_tasks" ADD CONSTRAINT "clinic_tasks_title_len" CHECK (char_length(btrim("title")) BETWEEN 1 AND 200);
CREATE UNIQUE INDEX "clinic_imported_contacts_phone" ON "clinic_imported_contacts" ("providerOrganizationId", "phone") WHERE "phone" IS NOT NULL;
CREATE UNIQUE INDEX "clinic_imported_contacts_email" ON "clinic_imported_contacts" ("providerOrganizationId", lower("email")) WHERE "email" IS NOT NULL;

-- Entitlements for the new clinic features (bulk reminders, exports). Basic gets neither.
INSERT INTO "clinic_plan_entitlements" ("id", "planId", "key", "type", "boolValue", "limitValue", "updatedAt")
SELECT gen_random_uuid(), p."id", e.key, 'BOOLEAN'::"SubscriptionEntitlementType", e.b, NULL, now()
FROM "clinic_plans" p
JOIN (VALUES
  ('CLINIC_BASIC',  'clinic.bulk_reminders', false), ('CLINIC_BASIC',  'clinic.exports', false),
  ('CLINIC_GROWTH', 'clinic.bulk_reminders', true),  ('CLINIC_GROWTH', 'clinic.exports', true),
  ('CLINIC_PRO',    'clinic.bulk_reminders', true),  ('CLINIC_PRO',    'clinic.exports', true)
) AS e(code, key, b) ON e.code = p."code"
ON CONFLICT ("planId", "key") DO NOTHING;
