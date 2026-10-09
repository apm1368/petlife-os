-- CreateEnum
CREATE TYPE "PlatformSettingChangeStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED', 'CANCELLED', 'SUPERSEDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminRole" ADD VALUE 'PARTNER_OPERATIONS';
ALTER TYPE "AdminRole" ADD VALUE 'CLINIC_OPERATIONS';
ALTER TYPE "AdminRole" ADD VALUE 'COMMERCE_OPERATIONS';
ALTER TYPE "AdminRole" ADD VALUE 'ANALYTICS';



-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByAdminId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "platform_setting_changes" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "previousValue" JSONB,
    "proposedValue" JSONB NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "status" "PlatformSettingChangeStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedByAdminId" UUID NOT NULL,
    "reviewedByAdminId" UUID,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "platform_setting_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_setting_changes_key_createdAt_idx" ON "platform_setting_changes"("key", "createdAt");

-- CreateIndex
CREATE INDEX "platform_setting_changes_status_idx" ON "platform_setting_changes"("status");

