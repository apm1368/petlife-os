import type { PetFriendlyPlace } from "@prisma/client";
import type { PetFriendlyPlaceDto } from "@petlife/types";
import { resolveObjectUrls } from "../storage/object-url.util";

export function toPetFriendlyPlaceDto(row: PetFriendlyPlace, options: { distanceMeters?: number | null; isFavorited?: boolean } = {}): PetFriendlyPlaceDto {
  return {
    id: row.id,
    name: row.name,
    category: row.category as unknown as PetFriendlyPlaceDto["category"],
    description: row.description,
    country: row.country,
    city: row.city,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    distanceMeters: options.distanceMeters ?? null,
    speciesAllowed: row.speciesAllowed as unknown as PetFriendlyPlaceDto["speciesAllowed"],
    sizeRestrictions: row.sizeRestrictions,
    indoorAllowed: row.indoorAllowed,
    outdoorAllowed: row.outdoorAllowed,
    petPolicy: row.petPolicy,
    imageObjectKeys: row.imageObjectKeys,
    imageUrls: resolveObjectUrls(row.imageObjectKeys),
    verificationSource: row.verificationSource,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    status: row.status as unknown as PetFriendlyPlaceDto["status"],
    isPubliclyListed: row.isPubliclyListed,
    isFavorited: options.isFavorited ?? false,
    createdAt: row.createdAt.toISOString(),
  };
}
