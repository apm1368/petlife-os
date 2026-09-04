-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'PLANNING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TravelMode" AS ENUM ('AIR', 'ROAD', 'RAIL', 'SEA', 'OTHER');

-- CreateEnum
CREATE TYPE "TravelRequirementType" AS ENUM ('VACCINATION', 'RABIES', 'MICROCHIP', 'HEALTH_CERTIFICATE', 'IMPORT_PERMIT', 'EXPORT_PERMIT', 'CARRIER', 'AIRLINE_POLICY', 'MEDICATION', 'QUARANTINE', 'PARASITE_TREATMENT', 'PASSPORT_DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TravelRequirementStatus" AS ENUM ('UNKNOWN', 'REQUIRED', 'NOT_REQUIRED', 'INCOMPLETE', 'READY');

-- CreateEnum
CREATE TYPE "InsuranceVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "InsuranceCoverageType" AS ENUM ('ACCIDENT', 'ILLNESS', 'SURGERY', 'DIAGNOSTICS', 'MEDICATION', 'DENTAL', 'PREVENTIVE', 'HOSPITALIZATION', 'EMERGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "InsuranceEligibilityStatus" AS ENUM ('ELIGIBLE', 'POSSIBLY_ELIGIBLE', 'NOT_ELIGIBLE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "InsuranceApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PetFriendlyPlaceCategory" AS ENUM ('PARK', 'CAFE', 'RESTAURANT', 'HOTEL', 'STORE', 'BEACH', 'VENUE', 'SERVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "PetFriendlyPlaceStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'SUSPENDED');

-- AlterEnum
ALTER TYPE "MedicalDocumentType" ADD VALUE 'TRAVEL_DOCUMENT';

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "originCountry" TEXT NOT NULL,
    "originCity" TEXT,
    "destinationCountry" TEXT NOT NULL,
    "destinationCity" TEXT,
    "departAt" TIMESTAMP(3) NOT NULL,
    "returnAt" TIMESTAMP(3),
    "travelMode" "TravelMode" NOT NULL DEFAULT 'OTHER',
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_requirements" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "requirementType" "TravelRequirementType" NOT NULL,
    "status" "TravelRequirementStatus" NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT,
    "sourceUrl" TEXT,
    "jurisdiction" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "linkedMedicalDocumentId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_providers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoObjectKey" TEXT,
    "country" TEXT NOT NULL,
    "status" "InsuranceVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "websiteUrl" TEXT,
    "isPubliclyListed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_products" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "speciesEligibility" "PetSpecies"[],
    "minAgeMonths" INTEGER,
    "maxAgeMonths" INTEGER,
    "coverageTypes" "InsuranceCoverageType"[],
    "coverageSummary" TEXT NOT NULL,
    "waitingPeriodDays" INTEGER,
    "deductibleAmountIrr" INTEGER,
    "annualLimitIrr" INTEGER,
    "coinsurancePercent" INTEGER,
    "premiumMinIrr" INTEGER,
    "premiumMaxIrr" INTEGER,
    "exclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "termsSource" TEXT,
    "termsUrl" TEXT,
    "status" "InsuranceVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "isPubliclyListed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_applications" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "petId" UUID NOT NULL,
    "applicantUserId" UUID NOT NULL,
    "status" "InsuranceApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "eligibilityStatus" "InsuranceEligibilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_friendly_places" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PetFriendlyPlaceCategory" NOT NULL,
    "description" TEXT,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" geography(Point, 4326),
    "speciesAllowed" "PetSpecies"[],
    "sizeRestrictions" TEXT,
    "indoorAllowed" BOOLEAN NOT NULL DEFAULT true,
    "outdoorAllowed" BOOLEAN NOT NULL DEFAULT true,
    "petPolicy" TEXT,
    "imageObjectKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verificationSource" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "status" "PetFriendlyPlaceStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "isPubliclyListed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_friendly_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_friendly_place_favorites" (
    "id" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_friendly_place_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trips_householdId_idx" ON "trips"("householdId");

-- CreateIndex
CREATE INDEX "trips_petId_idx" ON "trips"("petId");

-- CreateIndex
CREATE INDEX "travel_requirements_tripId_idx" ON "travel_requirements"("tripId");

-- CreateIndex
CREATE INDEX "insurance_providers_country_idx" ON "insurance_providers"("country");

-- CreateIndex
CREATE INDEX "insurance_products_providerId_idx" ON "insurance_products"("providerId");

-- CreateIndex
CREATE INDEX "insurance_products_country_idx" ON "insurance_products"("country");

-- CreateIndex
CREATE INDEX "insurance_applications_productId_idx" ON "insurance_applications"("productId");

-- CreateIndex
CREATE INDEX "insurance_applications_householdId_idx" ON "insurance_applications"("householdId");

-- CreateIndex
CREATE INDEX "insurance_applications_petId_idx" ON "insurance_applications"("petId");

-- CreateIndex
CREATE INDEX "pet_friendly_places_country_city_idx" ON "pet_friendly_places"("country", "city");

-- CreateIndex
CREATE INDEX "pet_friendly_places_category_idx" ON "pet_friendly_places"("category");

-- CreateIndex
CREATE INDEX "pet_friendly_place_favorites_userId_idx" ON "pet_friendly_place_favorites"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "pet_friendly_place_favorites_placeId_userId_key" ON "pet_friendly_place_favorites"("placeId", "userId");

-- CreateIndex (spatial)
-- Prisma has no way to declare a GiST index, so it's hand-added here.
-- PetFriendlyPlaceService is the only writer of `location`, always in the
-- same statement as latitude/longitude, so this index only ever needs to
-- exist for `ST_DWithin`/`ST_Distance` proximity reads — never a bounding-box
-- approximation over latitude/longitude alone.
CREATE INDEX "pet_friendly_places_location_gist_idx" ON "pet_friendly_places" USING GIST ("location");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_requirements" ADD CONSTRAINT "travel_requirements_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_requirements" ADD CONSTRAINT "travel_requirements_linkedMedicalDocumentId_fkey" FOREIGN KEY ("linkedMedicalDocumentId") REFERENCES "medical_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_products" ADD CONSTRAINT "insurance_products_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "insurance_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_applications" ADD CONSTRAINT "insurance_applications_productId_fkey" FOREIGN KEY ("productId") REFERENCES "insurance_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_applications" ADD CONSTRAINT "insurance_applications_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_applications" ADD CONSTRAINT "insurance_applications_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_friendly_place_favorites" ADD CONSTRAINT "pet_friendly_place_favorites_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "pet_friendly_places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

