import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { IsIn } from "class-validator";
import type { PetAccessFlags } from "@petlife/types";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import type { AuthedRequest } from "../../common/auth/current-user.decorator";
import { UpdatePetDto } from "./dto/update-pet.dto";
import { PetsService } from "./pets.service";
import { StorageService } from "../storage/storage.service";

class CreateUploadUrlDto {
  @IsIn(["image/jpeg", "image/png"])
  contentType!: "image/jpeg" | "image/png";
}

@Controller("pets")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class PetsController {
  constructor(
    private readonly petsService: PetsService,
    private readonly storageService: StorageService,
  ) {}

  @Get(":id")
  @RequirePetAccess("canViewIdentity")
  getById(@Param("id") id: string) {
    return this.petsService.getById(id);
  }

  /**
   * The caller's own effective permission union for this pet (see
   * PetAccessService.getEffectivePermissions) — the frontend uses this to
   * decide, e.g., whether Care Profile renders as editable or read-only,
   * without guessing from a failed write.
   */
  @Get(":id/access")
  @RequirePetAccess("canViewIdentity")
  getMyAccess(@Req() req: AuthedRequest & { petAccess?: PetAccessFlags }) {
    return req.petAccess;
  }

  @Patch(":id")
  @RequirePetAccess("canEditIdentity")
  update(@Param("id") id: string, @Body() dto: UpdatePetDto) {
    return this.petsService.update(id, dto);
  }

  @Post(":id/photo-upload-url")
  @RequirePetAccess("canEditIdentity")
  createPhotoUploadUrl(@Param("id") id: string, @Body() dto: CreateUploadUrlDto) {
    return this.storageService.createPetPhotoUploadTarget(id, dto.contentType);
  }
}
