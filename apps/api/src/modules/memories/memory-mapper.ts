import type { PetMemory } from "@prisma/client";
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
    mediaUrls: resolveObjectUrls(row.mediaObjectKeys),
    location: row.location,
    visibility: row.visibility as unknown as PetMemoryDto["visibility"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
