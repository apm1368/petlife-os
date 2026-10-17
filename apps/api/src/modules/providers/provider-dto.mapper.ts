import type { ProviderLocation, ProviderService, ProviderServiceVariant } from "@prisma/client";
import type { ProviderLocationDto, ProviderServiceDto, ProviderServiceVariantDto } from "@petlife/types";

/**
 * Shared mapping helpers used by ProvidersService, ServicesService, and
 * BookingsService — kept in one place so the (now fairly large)
 * ProviderServiceDto shape (Handoff 04 added category/age/weight/requires-
 * flags/locationMode) only needs updating once.
 */
export function toProviderLocationDto(location: ProviderLocation): ProviderLocationDto {
  return {
    id: location.id,
    providerOrganizationId: location.providerOrganizationId,
    name: location.name,
    addressLine: location.addressLine,
    city: location.city,
    region: location.region,
    countryCode: location.countryCode,
    latitude: location.latitude,
    longitude: location.longitude,
    phone: location.phone,
    timezone: location.timezone,
  };
}

export function toProviderServiceVariantDto(variant: ProviderServiceVariant): ProviderServiceVariantDto {
  return {
    id: variant.id,
    serviceId: variant.serviceId,
    name: variant.name,
    description: variant.description,
    priceAmount: variant.priceAmount ? Number(variant.priceAmount) : null,
    durationMinutes: variant.durationMinutes,
    sortOrder: variant.sortOrder,
    isActive: variant.isActive,
  };
}

/** Variants are included only when the caller loaded them; public callers pass active variants only. */
export function toProviderServiceDto(service: ProviderService & { variants?: ProviderServiceVariant[] }, options: { includeInactiveVariants?: boolean } = {}): ProviderServiceDto {
  return {
    id: service.id,
    providerOrganizationId: service.providerOrganizationId,
    locationId: service.locationId,
    name: service.name,
    description: service.description,
    type: service.type as unknown as ProviderServiceDto["type"],
    category: service.category as unknown as ProviderServiceDto["category"],
    durationMinutes: service.durationMinutes,
    priceAmount: service.priceAmount ? Number(service.priceAmount) : null,
    currency: service.currency,
    supportsDog: service.supportsDog,
    supportsCat: service.supportsCat,
    minAgeMonths: service.minAgeMonths,
    maxAgeMonths: service.maxAgeMonths,
    minWeightKg: service.minWeightKg ? Number(service.minWeightKg) : null,
    maxWeightKg: service.maxWeightKg ? Number(service.maxWeightKg) : null,
    requiresCareProfile: service.requiresCareProfile,
    requiresHealthBasics: service.requiresHealthBasics,
    locationMode: service.locationMode as unknown as ProviderServiceDto["locationMode"],
    isActive: service.isActive,
    bookingMode: service.bookingMode as unknown as ProviderServiceDto["bookingMode"],
    paymentMode: service.paymentMode as unknown as ProviderServiceDto["paymentMode"],
    depositAmount: service.depositAmount ? Number(service.depositAmount) : null,
    cancellationPolicy: service.cancellationPolicy,
    freeCancellationHours: service.freeCancellationHours,
    lateCancellationRefundPercent: service.lateCancellationRefundPercent,
    preparationNotes: service.preparationNotes,
    maxPetsPerBooking: service.maxPetsPerBooking,
    requiredResourceType: service.requiredResourceType,
    variants: (service.variants ?? []).filter((v) => options.includeInactiveVariants || v.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map(toProviderServiceVariantDto),
  };
}
