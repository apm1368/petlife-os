import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { CLAIM_ITEM_KINDS, ClaimPrepService, type ClaimItemKind } from "./claim-prep.service";

class CreateClaimPrepDto {
  @IsString() @Length(1, 120) title!: string;
  @IsOptional() @IsDateString() incidentDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
class AddClaimItemDto {
  @IsIn(CLAIM_ITEM_KINDS) kind!: ClaimItemKind;
  @IsUUID() refId!: string;
}
class SetClaimStatusDto {
  @IsIn(["DRAFT", "READY"]) status!: "DRAFT" | "READY";
}

/** Health data is involved, so reading needs canViewHealth and changing needs canEditHealth. */
@Controller("pets/:petId/claim-preps")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class ClaimPrepController {
  constructor(private readonly preps: ClaimPrepService) {}

  @Get()
  @RequirePetAccess("canViewHealth")
  list(@Param("petId", ParseUUIDPipe) petId: string) {
    return this.preps.list(petId);
  }

  @Post()
  @RequirePetAccess("canEditHealth")
  create(@Param("petId", ParseUUIDPipe) petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateClaimPrepDto) {
    return this.preps.create(petId, user.id, dto);
  }

  @Get(":id")
  @RequirePetAccess("canViewHealth")
  get(@Param("petId", ParseUUIDPipe) petId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.preps.get(petId, id);
  }

  @Post(":id/items")
  @RequirePetAccess("canEditHealth")
  addItem(@Param("petId", ParseUUIDPipe) petId: string, @Param("id", ParseUUIDPipe) id: string, @Body() dto: AddClaimItemDto) {
    return this.preps.addItem(petId, id, dto.kind, dto.refId);
  }

  @Delete(":id/items/:itemId")
  @RequirePetAccess("canEditHealth")
  removeItem(@Param("petId", ParseUUIDPipe) petId: string, @Param("id", ParseUUIDPipe) id: string, @Param("itemId", ParseUUIDPipe) itemId: string) {
    return this.preps.removeItem(petId, id, itemId);
  }

  @Patch(":id")
  @RequirePetAccess("canEditHealth")
  setStatus(@Param("petId", ParseUUIDPipe) petId: string, @Param("id", ParseUUIDPipe) id: string, @Body() dto: SetClaimStatusDto) {
    return this.preps.setStatus(petId, id, dto.status);
  }
}
