-- Batch 6: NGO / shelter staff memberships and organization-submitted verification. Additive only.
CREATE TYPE "AnimalSupportOrgRole" AS ENUM ('OWNER', 'COORDINATOR', 'VIEWER');

CREATE TABLE "animal_support_org_memberships" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "AnimalSupportOrgRole" NOT NULL DEFAULT 'COORDINATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "animal_support_org_memberships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "animal_support_org_memberships_organizationId_userId_key" ON "animal_support_org_memberships"("organizationId", "userId");
CREATE INDEX "animal_support_org_memberships_userId_idx" ON "animal_support_org_memberships"("userId");
ALTER TABLE "animal_support_org_memberships" ADD CONSTRAINT "animal_support_org_memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "animal_support_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "animal_support_organizations" ADD COLUMN "verificationSubmittedAt" TIMESTAMP(3);
ALTER TABLE "animal_support_organizations" ADD COLUMN "verificationNote" TEXT;
ALTER TABLE "animal_support_organizations" ADD COLUMN "verificationDocumentKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];
