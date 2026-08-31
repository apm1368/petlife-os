-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('fa', 'en');

-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');

-- CreateEnum
CREATE TYPE "HouseholdRole" AS ENUM ('OWNER', 'FAMILY');

-- CreateEnum
CREATE TYPE "PetSpecies" AS ENUM ('DOG', 'CAT');

-- CreateEnum
CREATE TYPE "PetSex" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "NeuteredStatus" AS ENUM ('NEUTERED', 'INTACT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WeightUnit" AS ENUM ('KG', 'LB');

-- CreateEnum
CREATE TYPE "PetLifecycleStatus" AS ENUM ('ACTIVE', 'LOST', 'TEMPORARILY_TRANSFERRED', 'DECEASED', 'MEMORIAL');

-- CreateEnum
CREATE TYPE "PetAccessSource" AS ENUM ('HOUSEHOLD', 'MANUAL', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "OnboardingChapter" AS ENUM ('ACCOUNT', 'HOUSEHOLD', 'PET_IDENTITY', 'PERSONALIZATION', 'READY');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PetInterest" AS ENUM ('HEALTH', 'VET', 'DAILY_CARE', 'SHOPPING', 'TRAINING', 'TRAVEL', 'INSURANCE', 'ANIMAL_SUPPORT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'fa',
    "themePreference" "ThemePreference" NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" UUID NOT NULL,
    "name" TEXT,
    "city" TEXT,
    "region" TEXT,
    "countryCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_members" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "HouseholdRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "household_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pets" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "species" "PetSpecies" NOT NULL,
    "breed" TEXT,
    "sex" "PetSex",
    "birthDate" DATE,
    "approximateAgeMonths" INTEGER,
    "photoUrl" TEXT,
    "latestWeightValue" DECIMAL(6,2),
    "latestWeightUnit" "WeightUnit",
    "colorMarkings" TEXT,
    "neuteredStatus" "NeuteredStatus",
    "microchipNumber" TEXT,
    "lifecycleStatus" "PetLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_access" (
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "active_pet_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "active_pet_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_pet_interests" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "petId" UUID,
    "interest" "PetInterest" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pet_interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_progress" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "householdId" UUID,
    "petId" UUID,
    "chapter" "OnboardingChapter" NOT NULL,
    "step" TEXT NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "completedSteps" JSONB NOT NULL DEFAULT '[]',
    "lastCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "household_members_householdId_userId_key" ON "household_members"("householdId", "userId");

-- CreateIndex
CREATE INDEX "pets_householdId_idx" ON "pets"("householdId");

-- CreateIndex
CREATE INDEX "pet_access_userId_idx" ON "pet_access"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "pet_access_petId_userId_key" ON "pet_access"("petId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "active_pet_preferences_userId_householdId_key" ON "active_pet_preferences"("userId", "householdId");

-- CreateIndex
CREATE UNIQUE INDEX "user_pet_interests_userId_petId_interest_key" ON "user_pet_interests"("userId", "petId", "interest");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_progress_userId_key" ON "onboarding_progress"("userId");

-- CreateIndex
CREATE INDEX "domain_events_processedAt_idx" ON "domain_events"("processedAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_access" ADD CONSTRAINT "pet_access_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_access" ADD CONSTRAINT "pet_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "active_pet_preferences" ADD CONSTRAINT "active_pet_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "active_pet_preferences" ADD CONSTRAINT "active_pet_preferences_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "active_pet_preferences" ADD CONSTRAINT "active_pet_preferences_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_pet_interests" ADD CONSTRAINT "user_pet_interests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_pet_interests" ADD CONSTRAINT "user_pet_interests_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
