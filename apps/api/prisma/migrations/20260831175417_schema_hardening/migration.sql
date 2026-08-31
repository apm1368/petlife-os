-- Schema hardening checkpoint (additive to 20260831165629_init).
-- Reviewed items:
--   1. users: DB-level CHECK for email/phone presence
--   2. onboarding_progress: real FK on householdId, SET NULL instead of CASCADE
--   3. user_pet_interests: partial unique indexes (NULL-safe uniqueness)
--   4. pet_access -> pet_access_grants: grant-based, multi-grant authorization model
--   5. active_pet_preferences: createdAt (domain validation lives in application code)
--   6. pets: microchipNormalized + partial unique index
--   7. delete-strategy prep: pets.deletedAt
--   8. domain_events: transactional-outbox columns
--   9. (no schema change) NULL vs UNKNOWN semantics documented in schema.prisma only

-- ============================================================================
-- 1. Drop constraints/indexes that are being replaced
-- ============================================================================

-- DropForeignKey
ALTER TABLE "onboarding_progress" DROP CONSTRAINT "onboarding_progress_petId_fkey";

-- DropForeignKey
ALTER TABLE "pet_access" DROP CONSTRAINT "pet_access_petId_fkey";

-- DropForeignKey
ALTER TABLE "pet_access" DROP CONSTRAINT "pet_access_userId_fkey";

-- DropIndex (replaced by two partial unique indexes further down)
DROP INDEX "user_pet_interests_userId_petId_interest_key";

-- ============================================================================
-- 2. Additive column changes
-- ============================================================================

-- AlterTable
ALTER TABLE "active_pet_preferences" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "domain_events" ADD COLUMN     "aggregateId" TEXT,
ADD COLUMN     "aggregateType" TEXT,
ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "eventVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "lastError" TEXT;

-- AlterTable
ALTER TABLE "pets" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "microchipNormalized" TEXT;

-- ============================================================================
-- 3. pet_access -> pet_access_grants (grant-based authorization model)
-- ============================================================================

-- CreateTable
CREATE TABLE "pet_access_grants" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "canViewIdentity" BOOLEAN NOT NULL DEFAULT true,
    "canEditIdentity" BOOLEAN NOT NULL DEFAULT false,
    "canViewHealth" BOOLEAN NOT NULL DEFAULT false,
    "canEditHealth" BOOLEAN NOT NULL DEFAULT false,
    "canBookCare" BOOLEAN NOT NULL DEFAULT false,
    "canViewCareProfile" BOOLEAN NOT NULL DEFAULT false,
    "canEditCareProfile" BOOLEAN NOT NULL DEFAULT false,
    "canViewLocation" BOOLEAN NOT NULL DEFAULT false,
    "canManageAccess" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "source" "PetAccessSource" NOT NULL DEFAULT 'HOUSEHOLD',
    "reason" TEXT,
    "grantedByUserId" UUID,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_access_grants_pkey" PRIMARY KEY ("id")
);

-- Deliberately no UNIQUE(petId, userId) — a user may hold multiple
-- simultaneous, independent grants for the same pet (e.g. a standing
-- HOUSEHOLD grant plus a temporary VET grant).

-- CreateIndex
CREATE INDEX "pet_access_grants_petId_userId_idx" ON "pet_access_grants"("petId", "userId");

-- CreateIndex
CREATE INDEX "pet_access_grants_expiresAt_idx" ON "pet_access_grants"("expiresAt");

-- CreateIndex
CREATE INDEX "pet_access_grants_source_idx" ON "pet_access_grants"("source");

-- CreateIndex
CREATE INDEX "pet_access_grants_revokedAt_idx" ON "pet_access_grants"("revokedAt");

-- Data migration: carry every existing pet_access row forward as an
-- unrevoked HOUSEHOLD-sourced-or-original-source grant, so this migration
-- does not silently discard the 7 rows the diff tool warned about.
-- reason / grantedByUserId / revokedAt / revokedByUserId have no equivalent
-- in the old table and are left NULL, which is the correct default.
INSERT INTO "pet_access_grants" (
    "id", "petId", "userId",
    "canViewIdentity", "canEditIdentity",
    "canViewHealth", "canEditHealth",
    "canBookCare",
    "canViewCareProfile", "canEditCareProfile",
    "canViewLocation", "canManageAccess",
    "startsAt", "expiresAt",
    "source",
    "createdAt", "updatedAt"
)
SELECT
    "id", "petId", "userId",
    "canViewIdentity", "canEditIdentity",
    "canViewHealth", "canEditHealth",
    "canBookCare",
    "canViewCareProfile", "canEditCareProfile",
    "canViewLocation", "canManageAccess",
    "startsAt", "expiresAt",
    "source",
    "createdAt", "updatedAt"
FROM "pet_access";

-- DropTable (data already carried forward above)
DROP TABLE "pet_access";

-- AddForeignKey
ALTER TABLE "pet_access_grants" ADD CONSTRAINT "pet_access_grants_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_access_grants" ADD CONSTRAINT "pet_access_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- 4. onboarding_progress: real FK + SET NULL policy
-- ============================================================================

-- AddForeignKey
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (was CASCADE; deleting/archiving a Pet must not delete the user's onboarding row)
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- 5. Query-performance index for user_pet_interests (uniqueness enforced below)
-- ============================================================================

-- CreateIndex
CREATE INDEX "user_pet_interests_userId_petId_interest_idx" ON "user_pet_interests"("userId", "petId", "interest");

-- ============================================================================
-- 6. domain_events aggregate lookup index
-- ============================================================================

-- CreateIndex
CREATE INDEX "domain_events_aggregateType_aggregateId_idx" ON "domain_events"("aggregateType", "aggregateId");

-- ============================================================================
-- 7. Hand-written constraints Prisma's schema DSL cannot express
-- ============================================================================

-- users: DB-level integrity backing AuthService's application-layer check.
-- Not modeled in schema.prisma (no multi-column CHECK syntax in Prisma) —
-- see the doc comment on the User model.
ALTER TABLE "users" ADD CONSTRAINT "users_email_or_phone_present" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);

-- user_pet_interests: Postgres treats NULL as distinct in a plain unique
-- index, so UNIQUE(userId, petId, interest) never stopped duplicate
-- (userId, NULL, interest) rows. Two partial unique indexes close that gap
-- without changing the "petId nullable" semantics.
-- KNOWN RISK: because these are not representable in schema.prisma, a future
-- `prisma migrate dev` schema diff may propose DROP INDEX statements for
-- these two indexes (Prisma sees them as unmanaged drift). Review any
-- generated migration touching user_pet_interests before applying it.
CREATE UNIQUE INDEX "user_pet_interests_user_interest_no_pet_key"
  ON "user_pet_interests" ("userId", "interest")
  WHERE "petId" IS NULL;

CREATE UNIQUE INDEX "user_pet_interests_user_pet_interest_key"
  ON "user_pet_interests" ("userId", "petId", "interest")
  WHERE "petId" IS NOT NULL;

-- pets: microchipNormalized uniqueness, non-null values only. Raw
-- microchipNumber is never validated/rejected — only the normalized form
-- (see PetsService.normalizeMicrochip) participates in this constraint, so
-- legacy/imported values that can't be confidently normalized are still
-- accepted and simply leave microchipNormalized NULL (excluded from the
-- index, same "unmanaged in schema.prisma" caveat as above applies here).
CREATE UNIQUE INDEX "pets_microchip_normalized_key"
  ON "pets" ("microchipNormalized")
  WHERE "microchipNormalized" IS NOT NULL;
