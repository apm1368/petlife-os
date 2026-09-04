import type { LostPetIncident, LostPetSighting, Pet } from "@prisma/client";
import type { LostPetIncidentDto, LostPetIncidentPublicDto, LostPetSightingDto } from "@petlife/types";
import { resolveObjectUrl } from "../storage/object-url.util";

type IncidentWithPet = LostPetIncident & { pet: Pet; _count?: { sightings: number } };

export function toLostPetIncidentDto(row: IncidentWithPet): LostPetIncidentDto {
  return {
    id: row.id,
    petId: row.petId,
    petName: row.pet.name,
    petSpecies: row.pet.species as unknown as LostPetIncidentDto["petSpecies"],
    petPhotoUrl: row.pet.photoUrl,
    householdId: row.householdId,
    status: row.status as unknown as LostPetIncidentDto["status"],
    lastKnownLocation: row.lastKnownLocation,
    lastKnownLatitude: row.lastKnownLatitude,
    lastKnownLongitude: row.lastKnownLongitude,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    description: row.description,
    publicNotes: row.publicNotes,
    privateNotes: row.privateNotes,
    primaryPhotoObjectKey: row.primaryPhotoObjectKey,
    primaryPhotoUrl: resolveObjectUrl(row.primaryPhotoObjectKey),
    contactPreference: row.contactPreference as unknown as LostPetIncidentDto["contactPreference"],
    publicContactMode: row.publicContactMode,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    foundAt: row.foundAt?.toISOString() ?? null,
    reunitedAt: row.reunitedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    sightingsCount: row._count?.sightings ?? 0,
  };
}

/** spec: "Do NOT expose: owner's home address, full phone number by default, private household information, private medical history, internal notes." No householdId, no privateNotes, no createdByUserId, no raw contact — publicContactMode only, and only when contactPreference is PUBLIC_CONTACT. */
export function toLostPetIncidentPublicDto(row: IncidentWithPet): LostPetIncidentPublicDto {
  return {
    id: row.id,
    petName: row.pet.name,
    petSpecies: row.pet.species as unknown as LostPetIncidentPublicDto["petSpecies"],
    petBreed: row.pet.breed,
    petColorMarkings: row.pet.colorMarkings,
    petApproximateAgeMonths: row.pet.approximateAgeMonths,
    primaryPhotoObjectKey: row.primaryPhotoObjectKey,
    primaryPhotoUrl: resolveObjectUrl(row.primaryPhotoObjectKey),
    status: row.status as unknown as LostPetIncidentPublicDto["status"],
    lastKnownLocation: row.lastKnownLocation,
    lastKnownLatitude: row.lastKnownLatitude,
    lastKnownLongitude: row.lastKnownLongitude,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    publicNotes: row.publicNotes,
    publicContactMode: row.contactPreference === "PUBLIC_CONTACT" ? row.publicContactMode : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toLostPetSightingDto(row: LostPetSighting): LostPetSightingDto {
  return {
    id: row.id,
    incidentId: row.incidentId,
    reporterUserId: row.reporterUserId,
    isAnonymous: row.reporterUserId === null,
    location: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
    seenAt: row.seenAt.toISOString(),
    description: row.description,
    photoObjectKey: row.photoObjectKey,
    photoUrl: resolveObjectUrl(row.photoObjectKey),
    status: row.status as unknown as LostPetSightingDto["status"],
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}
