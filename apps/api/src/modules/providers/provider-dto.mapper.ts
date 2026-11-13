import type { ProviderLocation, ProviderService, ProviderServiceVariant } from "@prisma/client";
import { supportedSpecies } from "../../common/species/catalog-species";
import { providerPinIsExact, publicPin } from "../../common/geo/geo";
import type { ProviderLocationDto, ProviderServiceDto, ProviderServiceVariantDto } from "@petlife/types";

/**
 * Shared mapping helpers used by ProvidersService, ServicesService, and
 * BookingsService — kept in one place so the (now fairly large)
 * ProviderServiceDto shape (Handoff 04 added category/age/weight/requires-
 * flags/locationMode) only needs updating once.
 */
/**
 * Who reads the location decides the pin it carries:
 * - `{ publicFor: orgType }` — anyone (discovery, service pages): storefronts at their exact pin, home-based providers
 *   (sitters, walkers, boarding, trainers, groomers, individual vets, pet taxi) at a ~1 km approximate point unless
 *   they opted in to show the exact spot;
 * - `"exact"` — the business itself, staff, and a member with a booking there (they have to find the door).
 */
export function toProviderLocationDto(location: ProviderLocation, view: { publicFor: string } | "exact"): ProviderLocationDto {
  const pin = view === "exact" ? publicPin(location, true) : publicPin(location, providerPinIsExact(view.publicFor, location.pinPublicExact));
  return {
    id: location.id,
    providerOrganizationId: location.providerOrganizationId,
    name: location.name,
    addressLine: location.addressLine,
    city: location.city,
    region: location.region,
    countryCode: location.countryCode,
    latitude: pin.latitude,
    longitude: pin.longitude,
    pinPrecision: pin.pinPrecision,
    ...(view === "exact" ? { pinPublicExact: location.pinPublicExact } : {}),
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
    supportedSpecies: supportedSpecies(service),
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
