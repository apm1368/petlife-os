import type { MedicalDocument, Pet, TravelRequirement, Trip } from "@prisma/client";
import type { TravelRequirementDto, TripDto } from "@petlife/types";
import { isTravelRequirementStale } from "./travel-staleness.util";

type TripWithPet = Trip & { pet: Pet; _count?: { requirements: number } };

export function toTripDto(row: TripWithPet): TripDto {
  return {
    id: row.id,
    householdId: row.householdId,
    petId: row.petId,
    petName: row.pet.name,
    petPhotoUrl: row.pet.photoUrl,
    createdByUserId: row.createdByUserId,
    originCountry: row.originCountry,
    originCity: row.originCity,
    destinationCountry: row.destinationCountry,
    destinationCity: row.destinationCity,
    departAt: row.departAt.toISOString(),
    returnAt: row.returnAt?.toISOString() ?? null,
    travelMode: row.travelMode as unknown as TripDto["travelMode"],
    status: row.status as unknown as TripDto["status"],
    notes: row.notes,
    requirementsCount: row._count?.requirements ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type RequirementWithDocument = TravelRequirement & { linkedMedicalDocument?: MedicalDocument | null };

export function toTravelRequirementDto(row: RequirementWithDocument): TravelRequirementDto {
  return {
    id: row.id,
    tripId: row.tripId,
    requirementType: row.requirementType as unknown as TravelRequirementDto["requirementType"],
    status: row.status as unknown as TravelRequirementDto["status"],
    source: row.source,
    sourceUrl: row.sourceUrl,
    jurisdiction: row.jurisdiction,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    validUntil: row.validUntil?.toISOString() ?? null,
    isStale: isTravelRequirementStale(row.verifiedAt, row.validUntil),
    linkedMedicalDocumentId: row.linkedMedicalDocumentId,
    linkedMedicalDocumentTitle: row.linkedMedicalDocument?.title ?? null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
