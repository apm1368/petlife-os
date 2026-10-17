import type { Prisma } from "@prisma/client";
import type {
  TravelBookingDto,
  TravelInventoryUnitDto,
  TravelListingDto,
  TravelPaymentStatus,
  TravelPetPolicyDto,
  TravelPriceBreakdownDto,
  TravelRatePlanDto,
  TravelRatePlanSnapshotDto,
  TravelRatingSummaryDto,
} from "@petlife/types";
import { resolveObjectUrls } from "../storage/object-url.util";
import { toDateKey } from "./travel-date.util";

export const EMPTY_TRAVEL_RATING: TravelRatingSummaryDto = { average: null, count: 0, petFriendliness: null, cleanliness: null, location: null };

export const LISTING_INCLUDE = {
  organization: { select: { name: true } },
  petPolicy: true,
  units: { orderBy: { basePriceIrr: "asc" }, include: { ratePlans: { orderBy: [{ priceModifierPercent: "asc" }, { createdAt: "asc" }] } } },
  media: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.TravelListingInclude;

export type ListingWithRelations = Prisma.TravelListingGetPayload<{ include: typeof LISTING_INCLUDE }>;

export const BOOKING_INCLUDE = {
  listing: { select: { title: true, type: true, city: true, bookingMode: true, organizationId: true, media: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } } },
  unit: { select: { name: true } },
  pets: { include: { pet: { select: { name: true, species: true } } } },
  statusEvents: { orderBy: { createdAt: "asc" } },
  review: { select: { id: true } },
  documentShares: { include: { medicalDocument: { select: { title: true, documentType: true } } }, orderBy: { createdAt: "asc" } },
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

export function toTravelRatePlanDto(row: ListingWithRelations["units"][number]["ratePlans"][number]): TravelRatePlanDto {
  return {
    id: row.id,
    unitId: row.unitId,
    name: row.name,
    priceModifierPercent: row.priceModifierPercent,
    cancellationType: row.cancellationType,
    freeCancellationDays: row.freeCancellationDays,
    lateRefundPercent: row.lateRefundPercent,
    paymentTiming: row.paymentTiming,
    depositPercent: row.depositPercent,
    includesBreakfast: row.includesBreakfast,
    includedItems: row.includedItems,
    minNights: row.minNights,
    activeFrom: row.activeFrom?.toISOString() ?? null,
    activeUntil: row.activeUntil?.toISOString() ?? null,
    isActive: row.isActive,
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
    bedInfo: row.bedInfo,
    sizeSqm: row.sizeSqm,
    amenities: row.amenities,
    maxPets: row.maxPets,
    petNotes: row.petNotes,
    ratePlans: row.ratePlans.map(toTravelRatePlanDto),
  };
}

export function toTravelListingDto(row: ListingWithRelations, rating: TravelRatingSummaryDto = EMPTY_TRAVEL_RATING): TravelListingDto {
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
    imageUrls: [...row.media.filter((m) => !m.unitId).map((m) => m.url), ...resolveObjectUrls(row.imageObjectKeys)],
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
    province: row.province,
    checkInFrom: row.checkInFrom,
    checkOutUntil: row.checkOutUntil,
    houseRules: row.houseRules,
    media: row.media.map((m) => ({ id: m.id, url: m.url, alt: m.alt, unitId: m.unitId })),
    rating,
    moderationNote: row.moderationNote,
  };
}

export interface BookingDtoExtras {
  canCancel?: boolean;
  canModify?: boolean;
  canReview?: boolean;
  refundPreviewIrr?: number | null;
}

export function toTravelBookingDto(row: BookingWithRelations, extras: BookingDtoExtras = {}): TravelBookingDto {
  const now = Date.now();
  return {
    id: row.id,
    reference: row.reference,
    listingId: row.listingId,
    listingTitle: row.listing.title,
    listingType: row.listing.type as unknown as TravelBookingDto["listingType"],
    bookingMode: row.listing.bookingMode as unknown as TravelBookingDto["bookingMode"],
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
    ratePlanId: row.ratePlanId,
    ratePlan: (row.ratePlanSnapshot as unknown as TravelRatePlanSnapshotDto | null) ?? null,
    petPolicySnapshot: (row.petPolicySnapshot as unknown as TravelPetPolicyDto | null) ?? null,
    priceBreakdown: (row.priceBreakdownSnapshot as unknown as TravelPriceBreakdownDto | null) ?? null,
    discountAmountIrr: row.discountAmountIrr,
    payNowAmountIrr: row.payNowAmountIrr,
    paymentStatus: row.paymentStatus as TravelPaymentStatus,
    holdExpiresAt: row.holdExpiresAt?.toISOString() ?? null,
    requestExpiresAt: row.requestExpiresAt?.toISOString() ?? null,
    refundAmountIrr: row.refundAmountIrr,
    cancelReason: row.cancelReason,
    cancelledBy: row.cancelledBy,
    listingCoverUrl: row.listing.media[0]?.url ?? null,
    timeline: row.statusEvents.map((e) => ({ fromStatus: e.fromStatus, toStatus: e.toStatus, actorType: e.actorType, reason: e.reason, createdAt: e.createdAt.toISOString() })),
    canCancel: extras.canCancel ?? false,
    canModify: extras.canModify ?? false,
    canReview: extras.canReview ?? false,
    reviewId: row.review?.id ?? null,
    refundPreviewIrr: extras.refundPreviewIrr ?? null,
    documentShares: row.documentShares.map((s) => ({
      id: s.id,
      medicalDocumentId: s.medicalDocumentId,
      title: s.medicalDocument.title,
      documentType: s.medicalDocument.documentType,
      purpose: s.purpose,
      expiresAt: s.expiresAt.toISOString(),
      revokedAt: s.revokedAt?.toISOString() ?? null,
      isActive: !s.revokedAt && s.expiresAt.getTime() > now,
    })),
  };
}
