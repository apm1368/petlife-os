-- Handoff 24 — Veterinary Clinical Panel (Vet Practice OS).
--
-- Generated with `prisma migrate diff --from-schema-datamodel <previous
-- schema.prisma> --to-schema-datamodel <this schema.prisma> --script` rather
-- than `--from-migrations`, precisely so the spurious `DROP INDEX
-- "pet_friendly_places_location_gist_idx"` every prior migration had to strip
-- by hand (that H19 PostGIS index cannot be expressed in schema.prisma, so the
-- migrations-based differ reads it as drift) is never emitted in the first
-- place. Purely additive: ten new tables, thirteen new enums, no ALTER or DROP
-- against anything that already exists.

-- CreateEnum
CREATE TYPE "TriageLevel" AS ENUM ('ROUTINE', 'URGENT', 'EMERGENT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MucousMembraneColor" AS ENUM ('PINK', 'PALE', 'WHITE', 'CYANOTIC', 'ICTERIC', 'BRICK_RED', 'MUDDY');

-- CreateEnum
CREATE TYPE "HydrationStatus" AS ENUM ('EUHYDRATED', 'MILD_DEHYDRATION', 'MODERATE_DEHYDRATION', 'SEVERE_DEHYDRATION');

-- CreateEnum
CREATE TYPE "ClinicalProblemStatus" AS ENUM ('ACTIVE', 'CHRONIC', 'RESOLVED', 'RULED_OUT');

-- CreateEnum
CREATE TYPE "PrescriptionRoute" AS ENUM ('ORAL', 'SUBCUTANEOUS', 'INTRAVENOUS', 'INTRAMUSCULAR', 'TOPICAL', 'OTIC', 'OPHTHALMIC', 'INHALED', 'RECTAL', 'INTRANASAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HospitalizationStatus" AS ENUM ('ADMITTED', 'DISCHARGED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TreatmentTaskType" AS ENUM ('MEDICATION', 'FLUID_THERAPY', 'MONITORING', 'FEEDING', 'WALK', 'PROCEDURE', 'SAMPLE_COLLECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "TreatmentTaskStatus" AS ENUM ('SCHEDULED', 'DONE', 'SKIPPED', 'MISSED');

-- CreateEnum
CREATE TYPE "ClinicalEstimateStatus" AS ENUM ('DRAFT', 'PRESENTED', 'APPROVED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DischargeSummaryStatus" AS ENUM ('DRAFT', 'ISSUED');

-- CreateEnum
CREATE TYPE "ClinicalAlertType" AS ENUM ('HANDLING', 'AGGRESSION', 'MEDICAL', 'ANAESTHETIC', 'ALLERGY', 'INFECTIOUS', 'OTHER');

-- CreateEnum
CREATE TYPE "ClinicalAlertSeverity" AS ENUM ('INFO', 'CAUTION', 'CRITICAL');

-- CreateTable
CREATE TABLE "patient_vitals_records" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "clinicalVisitId" UUID,
    "hospitalizationId" UUID,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weightValue" DECIMAL(6,2),
    "weightUnit" "WeightUnit",
    "temperatureC" DECIMAL(4,1),
    "heartRateBpm" INTEGER,
    "respiratoryRateBpm" INTEGER,
    "capillaryRefillSeconds" DECIMAL(3,1),
    "systolicBloodPressure" INTEGER,
    "oxygenSaturationPercent" INTEGER,
    "bloodGlucoseMgDl" INTEGER,
    "mucousMembraneColor" "MucousMembraneColor",
    "hydrationStatus" "HydrationStatus",
    "bodyConditionScore" INTEGER,
    "bodyConditionScale" TEXT,
    "painScore" INTEGER,
    "painScale" TEXT,
    "triageLevel" "TriageLevel",
    "notes" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'PROVIDER',
    "providerOrganizationId" UUID NOT NULL,
    "providerUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_vitals_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_problems" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "providerUserId" UUID,
    "originatingVisitId" UUID,
    "name" TEXT NOT NULL,
    "bodySystem" TEXT,
    "status" "ClinicalProblemStatus" NOT NULL DEFAULT 'ACTIVE',
    "onsetAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "providerUserId" UUID NOT NULL,
    "clinicalVisitId" UUID,
    "medicationId" UUID,
    "drugName" TEXT NOT NULL,
    "strength" TEXT,
    "form" TEXT,
    "route" "PrescriptionRoute" NOT NULL DEFAULT 'ORAL',
    "doseAmount" DECIMAL(10,3),
    "doseUnit" TEXT,
    "frequencyText" TEXT,
    "durationDays" INTEGER,
    "quantityDispensed" DECIMAL(10,2),
    "quantityUnit" TEXT,
    "refillsAuthorized" INTEGER NOT NULL DEFAULT 0,
    "refillsDispensed" INTEGER NOT NULL DEFAULT 0,
    "isControlledSubstance" BOOLEAN NOT NULL DEFAULT false,
    "instructionsForOwner" TEXT,
    "internalNotes" TEXT,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "prescribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitalizations" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "attendingProviderUserId" UUID,
    "clinicalVisitId" UUID,
    "status" "HospitalizationStatus" NOT NULL DEFAULT 'ADMITTED',
    "reasonForAdmission" TEXT NOT NULL,
    "kennelLabel" TEXT,
    "triageLevel" "TriageLevel",
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimatedDischargeAt" TIMESTAMP(3),
    "dischargedAt" TIMESTAMP(3),
    "dischargeNote" TEXT,
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitalizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_tasks" (
    "id" UUID NOT NULL,
    "hospitalizationId" UUID NOT NULL,
    "type" "TreatmentTaskType" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "prescriptionId" UUID,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "TreatmentTaskStatus" NOT NULL DEFAULT 'SCHEDULED',
    "completedAt" TIMESTAMP(3),
    "completedByProviderUserId" UUID,
    "outcomeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_estimates" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "providerUserId" UUID,
    "clinicalVisitId" UUID,
    "title" TEXT NOT NULL,
    "status" "ClinicalEstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "lowTotalIrr" BIGINT NOT NULL DEFAULT 0,
    "highTotalIrr" BIGINT NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "presentedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "respondedByUserId" UUID,
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_estimate_lines" (
    "id" UUID NOT NULL,
    "estimateId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitLowIrr" BIGINT NOT NULL,
    "unitHighIrr" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_estimate_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_note_templates" (
    "id" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "presentingComplaint" TEXT,
    "species" "PetSpecies",
    "reasonForVisitTemplate" TEXT,
    "historyTemplate" TEXT,
    "observationsTemplate" TEXT,
    "assessmentTemplate" TEXT,
    "planTemplate" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByProviderUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_note_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discharge_summaries" (
    "id" UUID NOT NULL,
    "clinicalVisitId" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "issuedByProviderUserId" UUID,
    "status" "DischargeSummaryStatus" NOT NULL DEFAULT 'DRAFT',
    "summaryText" TEXT,
    "homeCareInstructions" TEXT,
    "medicationsSummary" TEXT,
    "warningSignsText" TEXT,
    "followUpAt" TIMESTAMP(3),
    "followUpInstructions" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discharge_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_clinical_alerts" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "createdByProviderUserId" UUID,
    "type" "ClinicalAlertType" NOT NULL,
    "severity" "ClinicalAlertSeverity" NOT NULL DEFAULT 'CAUTION',
    "message" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByProviderUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_clinical_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_vitals_records_petId_recordedAt_idx" ON "patient_vitals_records"("petId", "recordedAt");

-- CreateIndex
CREATE INDEX "patient_vitals_records_clinicalVisitId_idx" ON "patient_vitals_records"("clinicalVisitId");

-- CreateIndex
CREATE INDEX "patient_vitals_records_hospitalizationId_idx" ON "patient_vitals_records"("hospitalizationId");

-- CreateIndex
CREATE INDEX "clinical_problems_petId_status_idx" ON "clinical_problems"("petId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_medicationId_key" ON "prescriptions"("medicationId");

-- CreateIndex
CREATE INDEX "prescriptions_petId_status_idx" ON "prescriptions"("petId", "status");

-- CreateIndex
CREATE INDEX "prescriptions_clinicalVisitId_idx" ON "prescriptions"("clinicalVisitId");

-- CreateIndex
CREATE INDEX "hospitalizations_providerOrganizationId_status_idx" ON "hospitalizations"("providerOrganizationId", "status");

-- CreateIndex
CREATE INDEX "hospitalizations_petId_idx" ON "hospitalizations"("petId");

-- CreateIndex
CREATE INDEX "treatment_tasks_hospitalizationId_scheduledAt_idx" ON "treatment_tasks"("hospitalizationId", "scheduledAt");

-- CreateIndex
CREATE INDEX "treatment_tasks_status_scheduledAt_idx" ON "treatment_tasks"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "clinical_estimates_petId_status_idx" ON "clinical_estimates"("petId", "status");

-- CreateIndex
CREATE INDEX "clinical_estimates_providerOrganizationId_status_idx" ON "clinical_estimates"("providerOrganizationId", "status");

-- CreateIndex
CREATE INDEX "clinical_estimate_lines_estimateId_idx" ON "clinical_estimate_lines"("estimateId");

-- CreateIndex
CREATE INDEX "clinical_note_templates_providerOrganizationId_isActive_idx" ON "clinical_note_templates"("providerOrganizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "discharge_summaries_clinicalVisitId_key" ON "discharge_summaries"("clinicalVisitId");

-- CreateIndex
CREATE INDEX "discharge_summaries_petId_idx" ON "discharge_summaries"("petId");

-- CreateIndex
CREATE INDEX "provider_clinical_alerts_petId_resolvedAt_idx" ON "provider_clinical_alerts"("petId", "resolvedAt");

-- CreateIndex
CREATE INDEX "provider_clinical_alerts_providerOrganizationId_idx" ON "provider_clinical_alerts"("providerOrganizationId");

-- AddForeignKey
ALTER TABLE "patient_vitals_records" ADD CONSTRAINT "patient_vitals_records_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_vitals_records" ADD CONSTRAINT "patient_vitals_records_clinicalVisitId_fkey" FOREIGN KEY ("clinicalVisitId") REFERENCES "clinical_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_vitals_records" ADD CONSTRAINT "patient_vitals_records_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "hospitalizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_vitals_records" ADD CONSTRAINT "patient_vitals_records_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_vitals_records" ADD CONSTRAINT "patient_vitals_records_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "provider_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_problems" ADD CONSTRAINT "clinical_problems_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_problems" ADD CONSTRAINT "clinical_problems_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_problems" ADD CONSTRAINT "clinical_problems_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "provider_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_problems" ADD CONSTRAINT "clinical_problems_originatingVisitId_fkey" FOREIGN KEY ("originatingVisitId") REFERENCES "clinical_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "provider_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_clinicalVisitId_fkey" FOREIGN KEY ("clinicalVisitId") REFERENCES "clinical_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalizations" ADD CONSTRAINT "hospitalizations_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalizations" ADD CONSTRAINT "hospitalizations_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalizations" ADD CONSTRAINT "hospitalizations_attendingProviderUserId_fkey" FOREIGN KEY ("attendingProviderUserId") REFERENCES "provider_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalizations" ADD CONSTRAINT "hospitalizations_clinicalVisitId_fkey" FOREIGN KEY ("clinicalVisitId") REFERENCES "clinical_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_tasks" ADD CONSTRAINT "treatment_tasks_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "hospitalizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_estimates" ADD CONSTRAINT "clinical_estimates_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_estimates" ADD CONSTRAINT "clinical_estimates_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_estimates" ADD CONSTRAINT "clinical_estimates_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_estimates" ADD CONSTRAINT "clinical_estimates_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "provider_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_estimates" ADD CONSTRAINT "clinical_estimates_clinicalVisitId_fkey" FOREIGN KEY ("clinicalVisitId") REFERENCES "clinical_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_estimate_lines" ADD CONSTRAINT "clinical_estimate_lines_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "clinical_estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_note_templates" ADD CONSTRAINT "clinical_note_templates_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_summaries" ADD CONSTRAINT "discharge_summaries_clinicalVisitId_fkey" FOREIGN KEY ("clinicalVisitId") REFERENCES "clinical_visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_summaries" ADD CONSTRAINT "discharge_summaries_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_summaries" ADD CONSTRAINT "discharge_summaries_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_clinical_alerts" ADD CONSTRAINT "provider_clinical_alerts_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_clinical_alerts" ADD CONSTRAINT "provider_clinical_alerts_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

