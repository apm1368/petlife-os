-- Admin two-step sign-in (TOTP, RFC 6238 — market-readiness Q75). Off for everyone until an admin enrols or a
-- SUPER_ADMIN enforces it; nothing changes for existing sessions or consumer accounts.
ALTER TABLE "sessions" ADD COLUMN "twoStepVerifiedAt" TIMESTAMP(3);

CREATE TABLE "admin_two_step_factors" (
    "userId" UUID NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "lastUsedStep" INTEGER NOT NULL DEFAULT 0,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admin_two_step_factors_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "admin_two_step_factors_counters_check" CHECK ("lastUsedStep" >= 0 AND "failedAttempts" >= 0)
);
ALTER TABLE "admin_two_step_factors" ADD CONSTRAINT "admin_two_step_factors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "admin_two_step_recovery_codes" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_two_step_recovery_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_two_step_recovery_codes_codeHash_key" ON "admin_two_step_recovery_codes"("codeHash");
CREATE INDEX "admin_two_step_recovery_codes_userId_idx" ON "admin_two_step_recovery_codes"("userId");
ALTER TABLE "admin_two_step_recovery_codes" ADD CONSTRAINT "admin_two_step_recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_two_step_factors"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "admin_two_step_policy" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enforcedAt" TIMESTAMP(3),
    "graceDays" INTEGER NOT NULL DEFAULT 7,
    "updatedByUserId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admin_two_step_policy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_two_step_policy_singleton_check" CHECK ("id" = 1),
    CONSTRAINT "admin_two_step_policy_grace_check" CHECK ("graceDays" BETWEEN 0 AND 30)
);
