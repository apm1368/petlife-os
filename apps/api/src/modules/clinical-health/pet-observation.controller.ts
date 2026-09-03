import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { PetObservationService } from "./pet-observation.service";
import { CreatePetObservationDto, RequestObservationMediaUploadDto } from "./dto/pet-observation.dto";

@Controller("pets/:petId/observations")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class PetObservationController {
  constructor(private readonly observations: PetObservationService) {}

  @Get()
  @RequirePetAccess("canViewHealth")
  list(@Param("petId") petId: string) {
    return this.observations.list(petId);
  }

  @Post("media-upload-url")
  @RequirePetAccess("canEditHealth")
  requestMediaUpload(@Param("petId") petId: string, @Body() dto: RequestObservationMediaUploadDto) {
    return this.observations.requestMediaUpload(petId, dto);
  }

  @Post()
  @RequirePetAccess("canEditHealth")
  create(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreatePetObservationDto) {
    return this.observations.create(petId, user.id, dto);
  }

  @Get(":observationId/download")
  @RequirePetAccess("canViewHealth")
  download(@Param("petId") petId: string, @Param("observationId") observationId: string) {
    return this.observations.getDownload(petId, observationId);
  }
}
