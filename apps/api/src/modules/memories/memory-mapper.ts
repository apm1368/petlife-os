import type { PetMemory } from "@prisma/client";
import { PetMemoryVisibility } from "@prisma/client";
import type { PetMemoryDto } from "@petlife/types";
import { resolveObjectUrls } from "../storage/object-url.util";

export function toPetMemoryDto(row: PetMemory): PetMemoryDto {
  return {
    id: row.id,
    petId: row.petId,
    householdId: row.householdId,
    createdByUserId: row.createdByUserId,
    type: row.type as unknown as PetMemoryDto["type"],
    title: row.title,
    description: row.description,
    occurredAt: row.occurredAt.toISOString(),
    mediaObjectKeys: row.mediaObjectKeys,
    // PRIVATE media is stored under a private key prefix (see
    // StorageService.createPetMemoryMediaUploadTarget) and must only ever be
    // reached through a per-request signed download (MemoryController's
    // media/:index/download route) — never a plain, permanent public URL.
    // Only a PUBLIC memory's media resolves to a public URL here.
    mediaUrls: row.visibility === PetMemoryVisibility.PUBLIC ? resolveObjectUrls(row.mediaObjectKeys) : [],
    location: row.location,
    visibility: row.visibility as unknown as PetMemoryDto["visibility"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
