-- CreateEnum
CREATE TYPE "ClinicInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');


-- AlterTable
ALTER TABLE "provider_users" ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "removedByProviderUserId" UUID;

-- CreateTable
CREATE TABLE "clinic_invitations" (
    "id" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "invitedUserId" UUID NOT NULL,
    "role" "ProviderUserRole" NOT NULL,
    "displayTitle" TEXT,
    "status" "ClinicInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedByProviderUserId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "acceptedProviderUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinic_invitations_providerOrganizationId_status_idx" ON "clinic_invitations"("providerOrganizationId", "status");

-- CreateIndex
CREATE INDEX "clinic_invitations_invitedUserId_status_idx" ON "clinic_invitations"("invitedUserId", "status");

-- AddForeignKey
ALTER TABLE "clinic_invitations" ADD CONSTRAINT "clinic_invitations_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_invitations" ADD CONSTRAINT "clinic_invitations_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- At most one PENDING invitation per (clinic, person).
CREATE UNIQUE INDEX "clinic_invitations_one_pending" ON "clinic_invitations" ("providerOrganizationId", "invitedUserId") WHERE "status" = 'PENDING';
CREATE INDEX "provider_users_active_idx" ON "provider_users" ("providerOrganizationId") WHERE "removedAt" IS NULL;
