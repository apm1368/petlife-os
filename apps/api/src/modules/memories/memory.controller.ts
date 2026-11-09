import { Body, Controller, Delete, Get, HttpStatus, Logger, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { PetMemoryService } from "./pet-memory.service";
import { LifeTimelineService } from "./life-timeline.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreatePetMemoryDto, ListPetMemoriesQueryDto, RequestPetMemoryMediaUploadDto, UpdatePetMemoryDto } from "./dto/memory.dto";
import { PetMemorialService, type SubmitPetMemorialInput } from "./pet-memorial.service";
import { StorageService } from "../storage/storage.service";
import { IsBoolean, IsString, IsUUID, Length } from "class-validator";

class SubmitMemorialDto implements SubmitPetMemorialInput {
  @IsString() @Length(1, 120) displayName!: string;
  @IsUUID() imageMemoryId!: string;
  @IsBoolean() consent!: boolean;
}

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
    private readonly memorials: PetMemorialService,
  ) {}

  @Post()
  @RequirePetAccess("canEditIdentity")
  async create(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreatePetMemoryDto) {
    const pet = await this.prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { householdId: true } });
    return this.memories.create(petId, pet.householdId, user.id, dto);
  }

  @Get()
  @RequirePetAccess("canViewIdentity")
  list(@Param("petId") petId: string, @Query() query: ListPetMemoriesQueryDto) {
    return this.memories.list(petId, query);
  }

  @Get("memorial")
  @RequirePetAccess("canViewIdentity")
  memorial(@Param("petId") petId: string, @CurrentUser() user: SessionUser) {
    return this.memorials.getForOwner(petId, user.id);
  }

  @Post("memorial")
  @RequirePetAccess("canEditIdentity")
  submitMemorial(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Body() dto: SubmitMemorialDto) {
    return this.memorials.submit(petId, user.id, dto);
  }

  @Post("memorial/withdraw")
  @RequirePetAccess("canEditIdentity")
  withdrawMemorial(@Param("petId") petId: string, @CurrentUser() user: SessionUser) {
    return this.memorials.withdraw(petId, user.id);
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

  /** spec: "avoid destructive deletion" — this archives (soft-delete), it never hard-deletes the row or its media. */
  @Delete(":memoryId")
  @RequirePetAccess("canEditIdentity")
  async delete(@Param("petId") petId: string, @Param("memoryId") memoryId: string) {
    await this.memories.archive(petId, memoryId);
  }

  @Post(":memoryId/restore")
  @RequirePetAccess("canEditIdentity")
  restore(@Param("petId") petId: string, @Param("memoryId") memoryId: string) {
    return this.memories.restore(petId, memoryId);
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

/** Public read-only listing. The service intentionally returns only a random
 * publication id, owner-approved display name and image URL. */
@Controller("public/pet-memorials")
export class PublicPetMemorialController {
  private readonly logger = new Logger(PublicPetMemorialController.name);

  constructor(private readonly memorials: PetMemorialService, private readonly storage: StorageService) {}

  @Get()
  list() {
    return this.memorials.listPublic();
  }

  @Get(":submissionId/image")
  async image(@Param("submissionId", ParseUUIDPipe) submissionId: string, @Res() response: Response) {
    const image = await this.memorials.getPublishedImage(submissionId);
    let object;
    try {
      object = await this.storage.openPetMemorialPublicationAsset(image.publicationObjectKey);
    } catch {
      // Storage exceptions may include the internal object key. Keep both the
      // response and application log free of pet/household identifiers.
      this.logger.warn("Published memorial image could not be read from storage");
      return response.status(HttpStatus.SERVICE_UNAVAILABLE).send();
    }
    response.status(HttpStatus.OK);
    response.setHeader("Content-Type", object.contentType ?? "application/octet-stream");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("CDN-Cache-Control", "no-store");
    response.setHeader("Surrogate-Control", "no-store");
    object.body.on("error", () => response.destroy());
    return object.body.pipe(response);
  }
}
