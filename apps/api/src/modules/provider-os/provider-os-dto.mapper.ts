import type { Booking, Pet, ProviderLocation, ProviderService, User } from "@prisma/client";
import type { ProviderAvailabilityExceptionDto, ProviderAvailabilityRuleDto, ProviderBookingSummaryDto } from "@petlife/types";
import type { ProviderAvailabilityRuleRow, ProviderAvailabilityExceptionRow } from "./provider-availability.service";

export type ProviderBookingRow = Booking & { pet: Pet; user: User; providerLocation: ProviderLocation; providerService: ProviderService };

export function toProviderBookingSummaryDto(booking: ProviderBookingRow): ProviderBookingSummaryDto {
  return {
    id: booking.id,
    petId: booking.petId,
    petName: booking.pet.name,
    petSpecies: booking.pet.species as unknown as ProviderBookingSummaryDto["petSpecies"],
    ownerDisplayName: booking.user.displayName,
    category: booking.category as unknown as ProviderBookingSummaryDto["category"],
    serviceName: booking.providerService.name,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    timezone: booking.timezone,
    locationLabel: booking.providerLocation.name ?? `${booking.providerLocation.city} — ${booking.providerLocation.addressLine}`,
    bookingStatus: booking.bookingStatus as unknown as ProviderBookingSummaryDto["bookingStatus"],
    paymentStatus: booking.paymentStatus as unknown as ProviderBookingSummaryDto["paymentStatus"],
    providerUserId: booking.providerUserId,
  };
}

export function toProviderAvailabilityRuleDto(rule: ProviderAvailabilityRuleRow): ProviderAvailabilityRuleDto {
  return {
    id: rule.id,
    providerOrganizationId: rule.providerOrganizationId,
    locationId: rule.locationId,
    providerUserId: rule.providerUserId,
    serviceId: rule.serviceId,
    dayOfWeek: rule.dayOfWeek,
    startLocalTime: rule.startLocalTime,
    endLocalTime: rule.endLocalTime,
    effectiveFrom: rule.effectiveFrom?.toISOString().slice(0, 10) ?? null,
    effectiveUntil: rule.effectiveUntil?.toISOString().slice(0, 10) ?? null,
    timezone: rule.timezone,
  };
}

export function toProviderAvailabilityExceptionDto(exception: ProviderAvailabilityExceptionRow): ProviderAvailabilityExceptionDto {
  return {
    id: exception.id,
    providerOrganizationId: exception.providerOrganizationId,
    locationId: exception.locationId,
    providerUserId: exception.providerUserId,
    startAt: exception.startAt.toISOString(),
    endAt: exception.endAt.toISOString(),
    type: exception.type as unknown as ProviderAvailabilityExceptionDto["type"],
    reason: exception.reason,
  };
}
