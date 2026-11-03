CREATE TYPE "FeatureFlagChangeStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED', 'CANCELLED', 'SUPERSEDED');

CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercentage" INTEGER NOT NULL DEFAULT 0,
    "cities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "betaUserIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByAdminId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "feature_flags_rolloutPercentage_check" CHECK ("rolloutPercentage" >= 0 AND "rolloutPercentage" <= 100)
);

CREATE TABLE "feature_flag_changes" (
    "id" UUID NOT NULL,
    "flagKey" TEXT NOT NULL,
    "previousValue" JSONB,
    "proposedValue" JSONB NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "status" "FeatureFlagChangeStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "requestedByAdminId" UUID NOT NULL,
    "reviewedByAdminId" UUID,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "feature_flag_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feature_flag_changes_flagKey_createdAt_idx" ON "feature_flag_changes"("flagKey", "createdAt");
CREATE INDEX "feature_flag_changes_status_idx" ON "feature_flag_changes"("status");
