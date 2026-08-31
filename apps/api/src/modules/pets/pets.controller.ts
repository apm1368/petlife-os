import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsIn } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
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
