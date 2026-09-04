import { Injectable } from "@nestjs/common";
import { PetMemoryVisibility } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { StorageService } from "../storage/storage.service";
import { PetMemoryNotFoundException } from "../../common/errors/api-exception";
import { toPetMemoryDto } from "./memory-mapper";
import type { CreatePetMemoryDto, UpdatePetMemoryDto } from "./dto/memory.dto";

/**
 * spec: "Memories are strategically important... a core emotional layer,
 * not a hidden photo gallery." Defaults to household-private
 * (`visibility: PRIVATE`) unless the household explicitly marks a memory
 * public (spec: "Memories default to household-private unless visibility
 * is explicitly public") — public memories are what a Community post may
 * safely reference later.
 */
@Injectable()
export class PetMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly storage: StorageService,
  ) {}

  private async getRawOrThrow(petId: string, memoryId: string) {
    const row = await this.prisma.petMemory.findFirst({ where: { id: memoryId, petId } });
    if (!row) throw new PetMemoryNotFoundException({ petId, memoryId });
    return row;
  }

  async create(petId: string, householdId: string, createdByUserId: string, dto: CreatePetMemoryDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.petMemory.create({
        data: {
          petId,
          householdId,
          createdByUserId,
          type: dto.type,
          title: dto.title,
          description: dto.description,
          occurredAt: new Date(dto.occurredAt),
          mediaObjectKeys: dto.mediaObjectKeys ?? [],
          location: dto.location,
          visibility: dto.visibility ?? PetMemoryVisibility.PRIVATE,
        },
      });
      await this.events.publish("PetMemoryAdded", { memoryId: created.id, petId, householdId, type: created.type }, { tx, aggregateType: "Pet", aggregateId: petId });
      return created;
    });
    return toPetMemoryDto(row);
  }

  async list(petId: string) {
    const rows = await this.prisma.petMemory.findMany({ where: { petId }, orderBy: { occurredAt: "desc" } });
    return rows.map(toPetMemoryDto);
  }

  async get(petId: string, memoryId: string) {
    return toPetMemoryDto(await this.getRawOrThrow(petId, memoryId));
  }

  async update(petId: string, memoryId: string, dto: UpdatePetMemoryDto) {
    await this.getRawOrThrow(petId, memoryId);
    const updated = await this.prisma.petMemory.update({
      where: { id: memoryId },
      data: {
        type: dto.type,
        title: dto.title,
        description: dto.description,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        mediaObjectKeys: dto.mediaObjectKeys,
        location: dto.location,
      },
    });
    return toPetMemoryDto(updated);
  }

  async delete(petId: string, memoryId: string): Promise<void> {
    await this.getRawOrThrow(petId, memoryId);
    await this.prisma.petMemory.delete({ where: { id: memoryId } });
  }

  async requestMediaUpload(petId: string, contentType: string, fileSizeBytes: number, visibility: PetMemoryVisibility) {
    return this.storage.createPetMemoryMediaUploadTarget(petId, contentType, fileSizeBytes, visibility);
  }
}
