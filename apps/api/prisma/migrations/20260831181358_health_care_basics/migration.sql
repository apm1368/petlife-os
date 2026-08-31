-- Handoff 02: Health Basics + Care Profile + Provenance Basics.
-- Additive on top of 20260831175417_schema_hardening.
-- Every new table's petId FK is ON DELETE RESTRICT (not CASCADE), continuing
-- the schema-hardening policy that health/history data must not be silently
-- destroyed by a Pet row disappearing (Pets are never hard-deleted through
-- the product today — see Pet.deletedAt).

-- CreateEnum
CREATE TYPE "SetupStatus" AS ENUM ('NOT_STARTED', 'PARTIAL', 'COMPLETE');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('OWNER', 'PROVIDER', 'IMPORTED_DOCUMENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "HealthAreaKnowledgeState" AS ENUM ('NONE_KNOWN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AllergyKnowledgeState" AS ENUM ('KNOWN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AllergyStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AllergySeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ConditionStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'HISTORICAL');

-- CreateEnum
CREATE TYPE "MedicationStatus" AS ENUM ('ACTIVE', 'SCHEDULED', 'COMPLETED', 'HISTORICAL');

-- CreateEnum
CREATE TYPE "VaccinationStatus" AS ENUM ('UP_TO_DATE', 'DUE_SOON', 'OVERDUE', 'UNKNOWN', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "DietType" AS ENUM ('DRY', 'WET', 'RAW', 'MIXED', 'PRESCRIPTION', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "HealthSeverity" AS ENUM ('NORMAL', 'INFORMATIONAL', 'ATTENTION', 'HIGHER_CONCERN', 'URGENT', 'EMERGENCY');

-- CreateTable
CREATE TABLE "health_profiles" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "status" "SetupStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "allergiesOverallState" "HealthAreaKnowledgeState",
    "conditionsOverallState" "HealthAreaKnowledgeState",
    "medicationsOverallState" "HealthAreaKnowledgeState",
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allergies" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "reaction" TEXT,
    "severity" "AllergySeverity",
    "knowledgeState" "AllergyKnowledgeState" NOT NULL DEFAULT 'KNOWN',
    "status" "AllergyStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceType" "SourceType" NOT NULL DEFAULT 'OWNER',
    "sourceLabel" TEXT,
    "recordedByUserId" UUID,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conditions" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ConditionStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'OWNER',
    "sourceLabel" TEXT,
    "recordedByUserId" UUID,
    "firstRecordedAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medications" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" DECIMAL(8,2),
    "unit" TEXT,
    "frequencyText" TEXT,
    "route" TEXT,
    "status" "MedicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATE,
    "endDate" DATE,
    "instructions" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'OWNER',
    "sourceLabel" TEXT,
    "recordedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccination_summaries" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "status" "VaccinationStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "nextDueDate" DATE,
    "lastKnownDate" DATE,
    "notes" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'OWNER',
    "sourceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaccination_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_profiles" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "dietType" "DietType",
    "currentFoodText" TEXT,
    "feedingFrequencyText" TEXT,
    "restrictionsText" TEXT,
    "status" "SetupStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nutrition_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_profiles" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "temperamentText" TEXT,
    "aroundPeopleText" TEXT,
    "aroundAnimalsText" TEXT,
    "leashBehaviorText" TEXT,
    "handlingSensitivityText" TEXT,
    "feedingRoutineText" TEXT,
    "toiletRoutineText" TEXT,
    "separationBehaviorText" TEXT,
    "specialInstructionsText" TEXT,
    "status" "SetupStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "health_profiles_petId_key" ON "health_profiles"("petId");

-- CreateIndex
CREATE INDEX "allergies_petId_idx" ON "allergies"("petId");

-- CreateIndex
CREATE INDEX "conditions_petId_idx" ON "conditions"("petId");

-- CreateIndex
CREATE INDEX "medications_petId_idx" ON "medications"("petId");

-- CreateIndex
CREATE INDEX "medications_status_idx" ON "medications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "vaccination_summaries_petId_key" ON "vaccination_summaries"("petId");

-- CreateIndex
CREATE UNIQUE INDEX "nutrition_profiles_petId_key" ON "nutrition_profiles"("petId");

-- CreateIndex
CREATE UNIQUE INDEX "care_profiles_petId_key" ON "care_profiles"("petId");

-- AddForeignKey
ALTER TABLE "health_profiles" ADD CONSTRAINT "health_profiles_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allergies" ADD CONSTRAINT "allergies_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination_summaries" ADD CONSTRAINT "vaccination_summaries_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_profiles" ADD CONSTRAINT "nutrition_profiles_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_profiles" ADD CONSTRAINT "care_profiles_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

