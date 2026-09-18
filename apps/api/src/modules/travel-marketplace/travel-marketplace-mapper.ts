import type { Prisma } from "@prisma/client";
import type { TravelBookingDto, TravelInventoryUnitDto, TravelListingDto, TravelPetPolicyDto } from "@petlife/types";
import { resolveObjectUrls } from "../storage/object-url.util";
import { toDateKey } from "./travel-date.util";

export const LISTING_INCLUDE = {
  organization: { select: { name: true } },
  petPolicy: true,
  units: { orderBy: { basePriceIrr: "asc" } },
} satisfies Prisma.TravelListingInclude;

export type ListingWithRelations = Prisma.TravelListingGetPayload<{ include: typeof LISTING_INCLUDE }>;

export const BOOKING_INCLUDE = {
  listing: { select: { title: true, type: true, city: true } },
  unit: { select: { name: true } },
  pets: { include: { pet: { select: { name: true, species: true } } } },
} satisfies Prisma.TravelBookingInclude;

export type BookingWithRelations = Prisma.TravelBookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

export function toTravelPetPolicyDto(row: NonNullable<ListingWithRelations["petPolicy"]>): TravelPetPolicyDto {
  return {
    dogsAllowed: row.dogsAllowed,
    catsAllowed: row.catsAllowed,
    otherAllowed: row.otherAllowed,
    maxPets: row.maxPets,
    maxWeightKg: row.maxWeightKg,
    minWeightKg: row.minWeightKg,
    breedRestrictions: row.breedRestrictions,
    vaccinationRequired: row.vaccinationRequired,
    healthCertificateRequired: row.healthCertificateRequired,
    carrierRequired: row.carrierRequired,
    leashRequired: row.leashRequired,
    petFeeIrr: row.petFeeIrr,
    depositIrr: row.depositIrr,
    restrictedAreas: row.restrictedAreas,
    notes: row.notes,
  };
}

export function toTravelInventoryUnitDto(row: ListingWithRelations["units"][number]): TravelInventoryUnitDto {
  return {
    id: row.id,
    listingId: row.listingId,
    name: row.name,
    description: row.description,
    quantity: row.quantity,
    maxOccupancy: row.maxOccupancy,
    basePriceIrr: row.basePriceIrr,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toTravelListingDto(row: ListingWithRelations): TravelListingDto {
  const activeUnits = row.units.filter((unit) => unit.isActive);
  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organization.name,
    type: row.type as unknown as TravelListingDto["type"],
    title: row.title,
    description: row.description,
    country: row.country,
    city: row.city,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    imageObjectKeys: row.imageObjectKeys,
    // Listing photos are public marketplace content, never a private key —
    // resolveObjectUrls() throws if that ever stops being true.
    imageUrls: resolveObjectUrls(row.imageObjectKeys),
    amenities: row.amenities,
    pricingMode: row.pricingMode as unknown as TravelListingDto["pricingMode"],
    bookingMode: row.bookingMode as unknown as TravelListingDto["bookingMode"],
    status: row.status as unknown as TravelListingDto["status"],
    cancellationPolicy: row.cancellationPolicy,
    isVerified: row.isVerified,
    isPubliclyListed: row.isPubliclyListed,
    petPolicy: row.petPolicy ? toTravelPetPolicyDto(row.petPolicy) : null,
    units: row.units.map(toTravelInventoryUnitDto),
    fromPriceIrr: activeUnits.length > 0 ? Math.min(...activeUnits.map((unit) => unit.basePriceIrr)) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toTravelBookingDto(row: BookingWithRelations): TravelBookingDto {
  return {
    id: row.id,
    reference: row.reference,
    listingId: row.listingId,
    listingTitle: row.listing.title,
    listingType: row.listing.type as unknown as TravelBookingDto["listingType"],
    listingCity: row.listing.city,
    unitId: row.unitId,
    unitName: row.unit.name,
    householdId: row.householdId,
    bookedByUserId: row.bookedByUserId,
    tripId: row.tripId,
    status: row.status as unknown as TravelBookingDto["status"],
    checkIn: toDateKey(row.checkIn),
    checkOut: toDateKey(row.checkOut),
    nights: row.nights,
    guests: row.guests,
    pets: row.pets.map((link) => ({ petId: link.petId, petName: link.pet.name, petSpecies: link.pet.species as unknown as TravelBookingDto["pets"][number]["petSpecies"] })),
    baseAmountIrr: row.baseAmountIrr,
    petFeeAmountIrr: row.petFeeAmountIrr,
    depositAmountIrr: row.depositAmountIrr,
    totalAmountIrr: row.totalAmountIrr,
    cancellationPolicySnapshot: row.cancellationPolicySnapshot,
    providerNote: row.providerNote,
    travelerNote: row.travelerNote,
    requestedAt: row.requestedAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
