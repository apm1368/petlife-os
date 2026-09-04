import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { PetMemoryService } from "./pet-memory.service";
import { LifeTimelineService } from "./life-timeline.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreatePetMemoryDto, RequestPetMemoryMediaUploadDto, UpdatePetMemoryDto } from "./dto/memory.dto";

/**
 * spec: "private Life Timeline" (auth-required, household-scoped) —
 * authorization reuses canViewIdentity/canEditIdentity for Memories
 * (identity/life-story content, not health or care-scheduling data) and
 * canViewHealth specifically for Life Timeline (it wraps HealthTimelineEntryDto
 * rows, so it needs the stronger health-viewing permission — see
 * LifeTimelineService's own doc comment).
 */
@Controller("pets/:petId/memories")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class MemoryController {
  constructor(
    private readonly memories: PetMemoryService,
    private readonly lifeTimeline: LifeTimelineService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @RequirePetAccess("canEditIdentity")
  async create(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreatePetMemoryDto) {
    const pet = await this.prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { householdId: true } });
    return this.memories.create(petId, pet.householdId, user.id, dto);
  }

  @Get()
  @RequirePetAccess("canViewIdentity")
  list(@Param("petId") petId: string) {
    return this.memories.list(petId);
  }

  @Get(":memoryId")
  @RequirePetAccess("canViewIdentity")
  get(@Param("petId") petId: string, @Param("memoryId") memoryId: string) {
    return this.memories.get(petId, memoryId);
  }

  @Patch(":memoryId")
  @RequirePetAccess("canEditIdentity")
  update(@Param("petId") petId: string, @Param("memoryId") memoryId: string, @Body() dto: UpdatePetMemoryDto) {
    return this.memories.update(petId, memoryId, dto);
  }

  @Delete(":memoryId")
  @RequirePetAccess("canEditIdentity")
  async delete(@Param("petId") petId: string, @Param("memoryId") memoryId: string) {
    await this.memories.delete(petId, memoryId);
  }

  @Post("upload-url")
  @RequirePetAccess("canEditIdentity")
  requestMediaUpload(@Param("petId") petId: string, @Body() dto: RequestPetMemoryMediaUploadDto) {
    return this.memories.requestMediaUpload(petId, dto.contentType, dto.fileSizeBytes, dto.visibility);
  }

  /** The only way to reach a PRIVATE memory's media (see memory-mapper.ts and PetMemoryService.getMediaDownload). */
  @Get(":memoryId/media/:index/download")
  @RequirePetAccess("canViewIdentity")
  getMediaDownload(@Param("petId") petId: string, @Param("memoryId") memoryId: string, @Param("index") index: string) {
    return this.memories.getMediaDownload(petId, memoryId, Number(index));
  }
}
