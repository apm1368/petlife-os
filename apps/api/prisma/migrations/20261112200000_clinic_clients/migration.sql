-- Clinic clients: a clinic's own owners (manual or imported), their pets, every text sent to them, and reminders
-- for clients who are not (yet) on the platform.
CREATE TYPE "ClinicClientSource" AS ENUM ('IMPORT', 'MANUAL');
CREATE TYPE "ClinicClientMessageKind" AS ENUM ('MESSAGE', 'REMINDER', 'INVITE');
CREATE TYPE "ClinicClientMessageStatus" AS ENUM ('SENT', 'SIMULATED', 'FAILED', 'SKIPPED');

ALTER TABLE "clinic_imported_contacts" ALTER COLUMN "importBatchId" DROP NOT NULL;
ALTER TABLE "clinic_imported_contacts"
  ADD COLUMN "source" "ClinicClientSource" NOT NULL DEFAULT 'IMPORT',
  ADD COLUMN "linkedUserId" UUID,
  ADD COLUMN "inviteToken" TEXT,
  ADD COLUMN "invitedAt" TIMESTAMP(3),
  ADD COLUMN "joinedAt" TIMESTAMP(3),
  ADD COLUMN "smsOptOutAt" TIMESTAMP(3),
  ADD COLUMN "optOutToken" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "clinic_imported_contacts_inviteToken_key" ON "clinic_imported_contacts"("inviteToken");
CREATE UNIQUE INDEX "clinic_imported_contacts_optOutToken_key" ON "clinic_imported_contacts"("optOutToken");
CREATE INDEX "clinic_imported_contacts_linkedUserId_idx" ON "clinic_imported_contacts"("linkedUserId");
ALTER TABLE "clinic_imported_contacts" ADD CONSTRAINT "clinic_imported_contacts_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "clinic_client_pets" (
    "id" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT,
    "breed" TEXT,
    "birthDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clinic_client_pets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "clinic_client_pets_contactId_idx" ON "clinic_client_pets"("contactId");
ALTER TABLE "clinic_client_pets" ADD CONSTRAINT "clinic_client_pets_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "clinic_imported_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "clinic_client_messages" (
    "id" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "kind" "ClinicClientMessageKind" NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ClinicClientMessageStatus" NOT NULL,
    "providerMessageId" TEXT,
    "failureReason" TEXT,
    "sentByProviderUserId" UUID,
    "reminderId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clinic_client_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "clinic_client_messages_contactId_createdAt_idx" ON "clinic_client_messages"("contactId", "createdAt");
CREATE INDEX "clinic_client_messages_providerOrganizationId_createdAt_idx" ON "clinic_client_messages"("providerOrganizationId", "createdAt");
ALTER TABLE "clinic_client_messages" ADD CONSTRAINT "clinic_client_messages_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "clinic_imported_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "clinic_reminders" ALTER COLUMN "petId" DROP NOT NULL;
ALTER TABLE "clinic_reminders" ADD COLUMN "contactId" UUID, ADD COLUMN "clientPetId" UUID;
CREATE INDEX "clinic_reminders_contactId_idx" ON "clinic_reminders"("contactId");
ALTER TABLE "clinic_reminders" ADD CONSTRAINT "clinic_reminders_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "clinic_imported_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinic_reminders" ADD CONSTRAINT "clinic_reminders_clientPetId_fkey" FOREIGN KEY ("clientPetId") REFERENCES "clinic_client_pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Exactly one target; a client pet only together with its client.
ALTER TABLE "clinic_reminders" ADD CONSTRAINT "clinic_reminders_one_target_check" CHECK ((("petId" IS NOT NULL)::int + ("contactId" IS NOT NULL)::int) = 1 AND ("clientPetId" IS NULL OR "contactId" IS NOT NULL));
