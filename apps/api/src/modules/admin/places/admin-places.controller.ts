import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { PetFriendlyPlaceService } from "../../places/pet-friendly-place.service";
import {
  CreatePetFriendlyPlaceDto,
  ListPetFriendlyPlacesQueryDto,
  RequestPetFriendlyPlaceImageUploadDto,
  SetPetFriendlyPlaceListedDto,
  SetPetFriendlyPlaceVerificationStatusDto,
  UpdatePetFriendlyPlaceDto,
} from "../../places/dto/places.dto";

@Controller("admin/places")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminPlacesController {
  constructor(private readonly places: PetFriendlyPlaceService) {}

  @Get()
  @RequireAdminPermission("places.view")
  list(@Query() query: ListPetFriendlyPlacesQueryDto) {
    return this.places.adminList(query);
  }

  @Get(":placeId")
  @RequireAdminPermission("places.view")
  get(@Param("placeId") placeId: string) {
    return this.places.adminGet(placeId);
  }

  @Post()
  @RequireAdminPermission("places.manage")
  create(@Body() dto: CreatePetFriendlyPlaceDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.places.create(admin, dto);
  }

  @Patch(":placeId")
  @RequireAdminPermission("places.manage")
  update(@Param("placeId") placeId: string, @Body() dto: UpdatePetFriendlyPlaceDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.places.update(admin, placeId, dto);
  }

  @Post(":placeId/verification")
  @RequireAdminPermission("places.manage")
  setVerification(@Param("placeId") placeId: string, @Body() dto: SetPetFriendlyPlaceVerificationStatusDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.places.setVerificationStatus(admin, placeId, dto);
  }

  @Post(":placeId/listing")
  @RequireAdminPermission("places.manage")
  setListed(@Param("placeId") placeId: string, @Body() dto: SetPetFriendlyPlaceListedDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.places.setPubliclyListed(admin, placeId, dto);
  }

  @Post(":placeId/image-upload-url")
  @RequireAdminPermission("places.manage")
  requestImageUpload(@Param("placeId") placeId: string, @Body() dto: RequestPetFriendlyPlaceImageUploadDto) {
    return this.places.requestImageUpload(placeId, dto.contentType, dto.fileSizeBytes);
  }
}
