import { Injectable } from "@nestjs/common";
import { Prisma, PetMemoryVisibility } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { StorageService } from "../storage/storage.service";
import { EntitlementService } from "../subscriptions/entitlement.service";
import { PetMemoryNotFoundException } from "../../common/errors/api-exception";
import { toPetMemoryDto } from "./memory-mapper";
import type { CreatePetMemoryDto, ListPetMemoriesQueryDto, UpdatePetMemoryDto } from "./dto/memory.dto";

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
    private readonly entitlements: EntitlementService,
  ) {}

  private async getRawOrThrow(petId: string, memoryId: string) {
    const row = await this.prisma.petMemory.findFirst({ where: { id: memoryId, petId } });
    if (!row) throw new PetMemoryNotFoundException({ petId, memoryId });
    return row;
  }

  /**
   * spec (Handoff 21): "limit checks must happen server-side... never hold
   * personal memories hostage after downgrade." `assertWithinLimit` is only
   * ever called here, on create — list/get/update/archive/restore never
   * consult it, so a household that later exceeds `memories.entries.max`
   * (e.g. after a downgrade) keeps full read/edit access to every memory it
   * already has; only *new* memories are gated.
   */
  async create(petId: string, householdId: string, createdByUserId: string, dto: CreatePetMemoryDto) {
    await this.entitlements.assertWithinLimit(householdId, "memories.entries.max");
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
          tags: dto.tags ?? [],
        },
      });
      await this.events.publish("PetMemoryAdded", { memoryId: created.id, petId, householdId, type: created.type }, { tx, aggregateType: "Pet", aggregateId: petId });
      return created;
    });
    return toPetMemoryDto(row);
  }

  /** spec: "find memories by text, date, tag, year" — all filters are optional and scoped to this already-authorized pet. `includeArchived` defaults to excluded, matching the soft-delete/archive semantics below. */
  async list(petId: string, query: ListPetMemoriesQueryDto = {}) {
    const where: Prisma.PetMemoryWhereInput = { petId };
    if (query.includeArchived !== "true") where.archivedAt = null;
    if (query.search) {
      const search = query.search;
      where.OR = [{ title: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }];
    }
    if (query.tag) where.tags = { has: query.tag };
    if (query.year) {
      const year = Number(query.year);
      where.occurredAt = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
    }
    const rows = await this.prisma.petMemory.findMany({ where, orderBy: { occurredAt: "desc" } });
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
        tags: dto.tags,
      },
    });
    return toPetMemoryDto(updated);
  }

  /**
   * spec: "Memories are personally meaningful data. Avoid destructive
   * deletion. Use soft/archive semantics." Replaces the old hard delete —
   * the row (and its media) is preserved, just excluded from the default
   * `list()` view. Idempotent: archiving an already-archived memory is a
   * harmless no-op re-write of the same timestamp-bearing state.
   */
  async archive(petId: string, memoryId: string): Promise<void> {
    await this.getRawOrThrow(petId, memoryId);
    await this.prisma.petMemory.update({ where: { id: memoryId }, data: { archivedAt: new Date() } });
  }

  async restore(petId: string, memoryId: string) {
    await this.getRawOrThrow(petId, memoryId);
    const updated = await this.prisma.petMemory.update({ where: { id: memoryId }, data: { archivedAt: null } });
    return toPetMemoryDto(updated);
  }

  async requestMediaUpload(petId: string, contentType: string, fileSizeBytes: number, visibility: PetMemoryVisibility) {
    return this.storage.createPetMemoryMediaUploadTarget(petId, contentType, fileSizeBytes, visibility);
  }

  /**
   * The only way to reach a PRIVATE memory's media — mirrors
   * PetObservationService.getDownload exactly. `index` is resolved against
   * this memory's own `mediaObjectKeys` server-side, never a client-supplied
   * key, so a caller can never mint a download URL for an arbitrary object.
   * A PUBLIC memory's media is already a plain URL in its own DTO
   * (see memory-mapper.ts) and does not need this path, but is still served
   * correctly here for a uniform frontend code path.
   */
  async getMediaDownload(petId: string, memoryId: string, index: number) {
    const row = await this.getRawOrThrow(petId, memoryId);
    const key = row.mediaObjectKeys[index];
    if (!key) return null;
    return this.storage.createPrivateDownloadTarget(key);
  }
}
