import type { ProviderLocation, ProviderService } from "@prisma/client";
import type { ProviderLocationDto, ProviderServiceDto } from "@petlife/types";

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

export function toProviderServiceDto(service: ProviderService): ProviderServiceDto {
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
  };
}
