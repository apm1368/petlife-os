import type { InsuranceApplication, InsuranceProduct, InsuranceProvider, Pet } from "@prisma/client";
import type { InsuranceApplicationDto, InsuranceProductDto, InsuranceProviderDto } from "@petlife/types";
import { resolveObjectUrl } from "../storage/object-url.util";

export function toInsuranceProviderDto(row: InsuranceProvider): InsuranceProviderDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    logoObjectKey: row.logoObjectKey,
    logoUrl: resolveObjectUrl(row.logoObjectKey),
    country: row.country,
    status: row.status as unknown as InsuranceProviderDto["status"],
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    websiteUrl: row.websiteUrl,
    isPubliclyListed: row.isPubliclyListed,
    createdAt: row.createdAt.toISOString(),
  };
}

type ProductWithProvider = InsuranceProduct & { provider: InsuranceProvider };

export function toInsuranceProductDto(row: ProductWithProvider): InsuranceProductDto {
  return {
    id: row.id,
    providerId: row.providerId,
    providerName: row.provider.name,
    providerLogoUrl: resolveObjectUrl(row.provider.logoObjectKey),
    name: row.name,
    country: row.country,
    speciesEligibility: row.speciesEligibility as unknown as InsuranceProductDto["speciesEligibility"],
    minAgeMonths: row.minAgeMonths,
    maxAgeMonths: row.maxAgeMonths,
    coverageTypes: row.coverageTypes as unknown as InsuranceProductDto["coverageTypes"],
    coverageSummary: row.coverageSummary,
    waitingPeriodDays: row.waitingPeriodDays,
    deductibleAmountIrr: row.deductibleAmountIrr,
    annualLimitIrr: row.annualLimitIrr,
    coinsurancePercent: row.coinsurancePercent,
    premiumMinIrr: row.premiumMinIrr,
    premiumMaxIrr: row.premiumMaxIrr,
    exclusions: row.exclusions,
    termsSource: row.termsSource,
    termsUrl: row.termsUrl,
    status: row.status as unknown as InsuranceProductDto["status"],
    isPubliclyListed: row.isPubliclyListed,
    createdAt: row.createdAt.toISOString(),
  };
}

type ApplicationWithRelations = InsuranceApplication & { product: ProductWithProvider; pet: Pet };

export function toInsuranceApplicationDto(row: ApplicationWithRelations): InsuranceApplicationDto {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.product.name,
    providerName: row.product.provider.name,
    householdId: row.householdId,
    petId: row.petId,
    petName: row.pet.name,
    applicantUserId: row.applicantUserId,
    status: row.status as unknown as InsuranceApplicationDto["status"],
    eligibilityStatus: row.eligibilityStatus as unknown as InsuranceApplicationDto["eligibilityStatus"],
    notes: row.notes,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
