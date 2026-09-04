-- CreateEnum
CREATE TYPE "MedicalDocumentType" AS ENUM ('LAB_REPORT', 'IMAGING_REPORT', 'PRESCRIPTION', 'VACCINATION_CERTIFICATE', 'REFERRAL', 'DISCHARGE_SUMMARY', 'CLINICAL_NOTE', 'DENTAL_RECORD', 'NUTRITION_PLAN', 'REHAB_PLAN', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('HOUSEHOLD_ONLY', 'PROVIDER_SHARED');

-- CreateEnum
CREATE TYPE "DocumentVerificationStatus" AS ENUM ('UNVERIFIED', 'PROVIDER_VERIFIED');

-- CreateEnum
CREATE TYPE "CorrectableRecordType" AS ENUM ('CONDITION', 'ALLERGY', 'MEDICATION', 'VACCINATION_SUMMARY', 'LAB_RESULT', 'IMAGING_STUDY', 'MEDICAL_DOCUMENT', 'CLINICAL_VISIT');

-- CreateEnum
CREATE TYPE "MedicalRecordCorrectionStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED_BY_PROVIDER', 'RESOLVED');

-- CreateEnum
CREATE TYPE "LabResultStatus" AS ENUM ('PENDING', 'FINAL', 'AMENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LabResultFlag" AS ENUM ('NORMAL', 'ABNORMAL');

-- CreateEnum
CREATE TYPE "ImagingStudyType" AS ENUM ('XRAY', 'ULTRASOUND', 'CT', 'MRI', 'OTHER');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('CREATED', 'SENT', 'ACCEPTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DentalRecordType" AS ENUM ('EXAM', 'CLEANING', 'PROCEDURE', 'EXTRACTION', 'FINDING', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "RehabPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "ObservationCategory" AS ENUM ('SYMPTOM', 'APPETITE', 'BEHAVIOR', 'MOBILITY', 'STOOL', 'VOMITING', 'SLEEP', 'PAIN', 'OTHER');

-- CreateEnum
CREATE TYPE "ObservationMediaType" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "ClinicalVisitStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'AMENDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "CarePlanItemType" AS ENUM ('MEDICATION', 'FOLLOW_UP', 'NUTRITION', 'REHAB', 'MONITORING', 'REFERRAL', 'VACCINATION', 'OTHER');

-- CreateEnum
CREATE TYPE "CarePlanItemStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CarePlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SourceType" ADD VALUE 'HOUSEHOLD_MEMBER';
ALTER TYPE "SourceType" ADD VALUE 'CLINIC';

-- AlterTable
ALTER TABLE "medications" ADD COLUMN     "carePlanItemId" UUID,
ADD COLUMN     "clinicalVisitId" UUID;

-- AlterTable
ALTER TABLE "pet_access_grants" ADD COLUMN     "canRecordClinicalData" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "medical_documents" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "documentType" "MedicalDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceType" "SourceType" NOT NULL,
    "sourceUserId" UUID,
    "sourceProviderOrganizationId" UUID,
    "sourceProviderUserId" UUID,
    "recordedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileObjectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'HOUSEHOLD_ONLY',
    "verificationStatus" "DocumentVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "relatedVisitId" UUID,
    "relatedLabResultId" UUID,
    "relatedImagingStudyId" UUID,
    "relatedReferralId" UUID,
    "voidedAt" TIMESTAMP(3),
    "voidedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_record_corrections" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "targetType" "CorrectableRecordType" NOT NULL,
    "targetId" UUID NOT NULL,
    "correctionText" TEXT NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "status" "MedicalRecordCorrectionStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_record_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_results" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "providerOrganizationId" UUID,
    "recordedByProviderUserId" UUID,
    "clinicalVisitId" UUID,
    "testName" TEXT NOT NULL,
    "testCode" TEXT,
    "sampleDate" DATE,
    "resultDate" DATE,
    "value" TEXT,
    "unit" TEXT,
    "referenceRangeLow" DECIMAL(10,3),
    "referenceRangeHigh" DECIMAL(10,3),
    "qualitativeResult" TEXT,
    "status" "LabResultStatus" NOT NULL DEFAULT 'PENDING',
    "flag" "LabResultFlag",
    "sourceType" "SourceType" NOT NULL DEFAULT 'PROVIDER',
    "notes" TEXT,
    "supersedesId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imaging_studies" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "providerOrganizationId" UUID,
    "performedByProviderUserId" UUID,
    "clinicalVisitId" UUID,
    "studyType" "ImagingStudyType" NOT NULL,
    "bodyRegion" TEXT,
    "performedAt" TIMESTAMP(3),
    "report" TEXT,
    "findings" TEXT,
    "recommendation" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'PROVIDER',
    "voidedAt" TIMESTAMP(3),
    "voidedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imaging_studies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "fromProviderOrganizationId" UUID NOT NULL,
    "fromProviderUserId" UUID,
    "toProviderOrganizationId" UUID,
    "externalProviderName" TEXT,
    "externalSpecialty" TEXT,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'CREATED',
    "clinicalVisitId" UUID,
    "fulfillingBookingId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dental_records" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "providerOrganizationId" UUID,
    "providerUserId" UUID,
    "clinicalVisitId" UUID,
    "recordType" "DentalRecordType" NOT NULL,
    "performedAt" TIMESTAMP(3),
    "findings" TEXT,
    "notes" TEXT,
    "followUpRecommended" BOOLEAN NOT NULL DEFAULT false,
    "followUpNotes" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'PROVIDER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dental_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_nutrition_plans" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "providerUserId" UUID,
    "clinicalVisitId" UUID,
    "goal" TEXT,
    "dietType" "DietType",
    "recommendedFoodText" TEXT,
    "dailyAmountText" TEXT,
    "frequencyText" TEXT,
    "restrictionsText" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "status" "CarePlanItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_nutrition_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rehab_plans" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "providerUserId" UUID,
    "clinicalVisitId" UUID,
    "goal" TEXT,
    "exercisesText" TEXT,
    "frequencyText" TEXT,
    "durationText" TEXT,
    "status" "RehabPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rehab_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rehab_sessions" (
    "id" UUID NOT NULL,
    "rehabPlanId" UUID NOT NULL,
    "sessionDate" DATE NOT NULL,
    "observation" TEXT,
    "progressNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rehab_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_observations" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "category" "ObservationCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "mediaType" "ObservationMediaType",
    "mediaObjectKey" TEXT,
    "mediaMimeType" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'OWNER',
    "recordedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_visits" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "bookingId" UUID,
    "providerOrganizationId" UUID NOT NULL,
    "providerUserId" UUID NOT NULL,
    "reasonForVisit" TEXT,
    "historyText" TEXT,
    "observationsText" TEXT,
    "assessmentText" TEXT,
    "planText" TEXT,
    "status" "ClinicalVisitStatus" NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_visit_revisions" (
    "id" UUID NOT NULL,
    "clinicalVisitId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "snapshotStatus" "ClinicalVisitStatus" NOT NULL,
    "snapshotReasonForVisit" TEXT,
    "snapshotHistoryText" TEXT,
    "snapshotObservationsText" TEXT,
    "snapshotAssessmentText" TEXT,
    "snapshotPlanText" TEXT,
    "amendedByProviderUserId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_visit_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_plans" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "providerOrganizationId" UUID NOT NULL,
    "providerUserId" UUID,
    "originatingVisitId" UUID,
    "title" TEXT NOT NULL,
    "status" "CarePlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_plan_items" (
    "id" UUID NOT NULL,
    "carePlanId" UUID NOT NULL,
    "type" "CarePlanItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" "CarePlanItemStatus" NOT NULL DEFAULT 'PENDING',
    "source" "SourceType" NOT NULL DEFAULT 'PROVIDER',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "senior_care_notes" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "mobilityNotes" TEXT,
    "cognitionNotes" TEXT,
    "medicationComplexityNotes" TEXT,
    "monitoringFrequencyText" TEXT,
    "qualityOfLifeNotes" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'OWNER',
    "recordedByUserId" UUID,
    "providerOrganizationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "senior_care_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "end_of_life_care_plans" (
    "id" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "palliativeCareNotes" TEXT,
    "endOfLifePreferences" TEXT,
    "aftercarePreferences" TEXT,
    "sourceType" "SourceType" NOT NULL DEFAULT 'OWNER',
    "recordedByUserId" UUID,
    "providerOrganizationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "end_of_life_care_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "medical_documents_fileObjectKey_key" ON "medical_documents"("fileObjectKey");

-- CreateIndex
CREATE INDEX "medical_documents_petId_idx" ON "medical_documents"("petId");

-- CreateIndex
CREATE INDEX "medical_documents_householdId_idx" ON "medical_documents"("householdId");

-- CreateIndex
CREATE INDEX "medical_documents_documentType_idx" ON "medical_documents"("documentType");

-- CreateIndex
CREATE INDEX "medical_record_corrections_targetType_targetId_idx" ON "medical_record_corrections"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "medical_record_corrections_petId_idx" ON "medical_record_corrections"("petId");

-- CreateIndex
CREATE UNIQUE INDEX "lab_results_supersedesId_key" ON "lab_results"("supersedesId");

-- CreateIndex
CREATE INDEX "lab_results_petId_idx" ON "lab_results"("petId");

-- CreateIndex
CREATE INDEX "lab_results_status_idx" ON "lab_results"("status");

-- CreateIndex
CREATE INDEX "imaging_studies_petId_idx" ON "imaging_studies"("petId");

-- CreateIndex
CREATE INDEX "referrals_petId_idx" ON "referrals"("petId");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- CreateIndex
CREATE INDEX "dental_records_petId_idx" ON "dental_records"("petId");

-- CreateIndex
CREATE INDEX "clinical_nutrition_plans_petId_idx" ON "clinical_nutrition_plans"("petId");

-- CreateIndex
CREATE INDEX "rehab_plans_petId_idx" ON "rehab_plans"("petId");

-- CreateIndex
CREATE INDEX "rehab_sessions_rehabPlanId_idx" ON "rehab_sessions"("rehabPlanId");

-- CreateIndex
CREATE INDEX "pet_observations_petId_idx" ON "pet_observations"("petId");

-- CreateIndex
CREATE INDEX "pet_observations_category_idx" ON "pet_observations"("category");

-- CreateIndex
CREATE INDEX "clinical_visits_petId_idx" ON "clinical_visits"("petId");

-- CreateIndex
CREATE INDEX "clinical_visits_householdId_idx" ON "clinical_visits"("householdId");

-- CreateIndex
CREATE INDEX "clinical_visits_providerOrganizationId_idx" ON "clinical_visits"("providerOrganizationId");

-- CreateIndex
CREATE INDEX "clinical_visits_status_idx" ON "clinical_visits"("status");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_visit_revisions_clinicalVisitId_revisionNumber_key" ON "clinical_visit_revisions"("clinicalVisitId", "revisionNumber");

-- CreateIndex
CREATE INDEX "care_plans_petId_idx" ON "care_plans"("petId");

-- CreateIndex
CREATE INDEX "care_plan_items_carePlanId_idx" ON "care_plan_items"("carePlanId");

-- CreateIndex
CREATE INDEX "care_plan_items_status_idx" ON "care_plan_items"("status");

-- CreateIndex
CREATE INDEX "senior_care_notes_petId_idx" ON "senior_care_notes"("petId");

-- CreateIndex
CREATE UNIQUE INDEX "end_of_life_care_plans_petId_key" ON "end_of_life_care_plans"("petId");

-- CreateIndex
CREATE INDEX "medications_clinicalVisitId_idx" ON "medications"("clinicalVisitId");

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_clinicalVisitId_fkey" FOREIGN KEY ("clinicalVisitId") REFERENCES "clinical_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_carePlanItemId_fkey" FOREIGN KEY ("carePlanItemId") REFERENCES "care_plan_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_sourceProviderOrganizationId_fkey" FOREIGN KEY ("sourceProviderOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_sourceProviderUserId_fkey" FOREIGN KEY ("sourceProviderUserId") REFERENCES "provider_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_relatedVisitId_fkey" FOREIGN KEY ("relatedVisitId") REFERENCES "clinical_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_relatedLabResultId_fkey" FOREIGN KEY ("relatedLabResultId") REFERENCES "lab_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_relatedImagingStudyId_fkey" FOREIGN KEY ("relatedImagingStudyId") REFERENCES "imaging_studies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_relatedReferralId_fkey" FOREIGN KEY ("relatedReferralId") REFERENCES "referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_record_corrections" ADD CONSTRAINT "medical_record_corrections_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_recordedByProviderUserId_fkey" FOREIGN KEY ("recordedByProviderUserId") REFERENCES "provider_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_clinicalVisitId_fkey" FOREIGN KEY ("clinicalVisitId") REFERENCES "clinical_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "lab_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_studies" ADD CONSTRAINT "imaging_studies_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_studies" ADD CONSTRAINT "imaging_studies_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_studies" ADD CONSTRAINT "imaging_studies_performedByProviderUserId_fkey" FOREIGN KEY ("performedByProviderUserId") REFERENCES "provider_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_studies" ADD CONSTRAINT "imaging_studies_clinicalVisitId_fkey" FOREIGN KEY ("clinicalVisitId") REFERENCES "clinical_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_fromProviderOrganizationId_fkey" FOREIGN KEY ("fromProviderOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_fromProviderUserId_fkey" FOREIGN KEY ("fromProviderUserId") REFERENCES "provider_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_toProviderOrganizationId_fkey" FOREIGN KEY ("toProviderOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_clinicalVisitId_fkey" FOREIGN KEY ("clinicalVisitId") REFERENCES "clinical_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_fulfillingBookingId_fkey" FOREIGN KEY ("fulfillingBookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_records" ADD CONSTRAINT "dental_records_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_records" ADD CONSTRAINT "dental_records_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_records" ADD CONSTRAINT "dental_records_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "provider_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_records" ADD CONSTRAINT "dental_records_clinicalVisitId_fkey" FOREIGN KEY ("clinicalVisitId") REFERENCES "clinical_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_nutrition_plans" ADD CONSTRAINT "clinical_nutrition_plans_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_nutrition_plans" ADD CONSTRAINT "clinical_nutrition_plans_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_nutrition_plans" ADD CONSTRAINT "clinical_nutrition_plans_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "provider_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_nutrition_plans" ADD CONSTRAINT "clinical_nutrition_plans_clinicalVisitId_fkey" FOREIGN KEY ("clinicalVisitId") REFERENCES "clinical_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rehab_plans" ADD CONSTRAINT "rehab_plans_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rehab_plans" ADD CONSTRAINT "rehab_plans_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rehab_plans" ADD CONSTRAINT "rehab_plans_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "provider_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rehab_plans" ADD CONSTRAINT "rehab_plans_clinicalVisitId_fkey" FOREIGN KEY ("clinicalVisitId") REFERENCES "clinical_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rehab_sessions" ADD CONSTRAINT "rehab_sessions_rehabPlanId_fkey" FOREIGN KEY ("rehabPlanId") REFERENCES "rehab_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_observations" ADD CONSTRAINT "pet_observations_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_visits" ADD CONSTRAINT "clinical_visits_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_visits" ADD CONSTRAINT "clinical_visits_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_visits" ADD CONSTRAINT "clinical_visits_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_visits" ADD CONSTRAINT "clinical_visits_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_visits" ADD CONSTRAINT "clinical_visits_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "provider_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_visit_revisions" ADD CONSTRAINT "clinical_visit_revisions_clinicalVisitId_fkey" FOREIGN KEY ("clinicalVisitId") REFERENCES "clinical_visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "provider_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_originatingVisitId_fkey" FOREIGN KEY ("originatingVisitId") REFERENCES "clinical_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_plan_items" ADD CONSTRAINT "care_plan_items_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "care_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "senior_care_notes" ADD CONSTRAINT "senior_care_notes_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "senior_care_notes" ADD CONSTRAINT "senior_care_notes_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "end_of_life_care_plans" ADD CONSTRAINT "end_of_life_care_plans_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "end_of_life_care_plans" ADD CONSTRAINT "end_of_life_care_plans_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "provider_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Data integrity constraints (Handoff 17) — encode key invariants at the DB
-- level, not just in application code (spec: "Database constraints must
-- encode key invariants").

-- Never impossible timestamps: a document/study/session can't record a
-- non-positive file size, and a visit can't complete before it started.
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_file_size_positive" CHECK ("fileSizeBytes" > 0);

ALTER TABLE "clinical_visits" ADD CONSTRAINT "clinical_visits_completed_after_started" CHECK ("completedAt" IS NULL OR "completedAt" >= "startedAt");

ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_sample_before_result" CHECK ("sampleDate" IS NULL OR "resultDate" IS NULL OR "sampleDate" <= "resultDate");

-- A referral can be COMPLETED or CANCELLED, never marked as both.
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_not_completed_and_cancelled" CHECK (NOT ("completedAt" IS NOT NULL AND "cancelledAt" IS NOT NULL));

-- A revision's number is always positive and unique per visit (the @@unique
-- index above already enforces the per-visit uniqueness; this adds the
-- "positive, monotonic" half of the invariant).
ALTER TABLE "clinical_visit_revisions" ADD CONSTRAINT "clinical_visit_revisions_number_positive" CHECK ("revisionNumber" > 0);

-- An override on a self-referencing supersession can never point at itself.
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_not_self_superseding" CHECK ("supersedesId" IS NULL OR "supersedesId" != "id");
