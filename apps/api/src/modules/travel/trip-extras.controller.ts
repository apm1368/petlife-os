import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { CHECKLIST_CATEGORIES, TripExtrasService } from "./trip-extras.service";

class AddChecklistItemDto {
  @IsString() @Length(1, 120) label!: string;
  @IsOptional() @IsIn(CHECKLIST_CATEGORIES) category?: (typeof CHECKLIST_CATEGORIES)[number];
}
class SetDoneDto {
  @IsBoolean() done!: boolean;
}
class AddParticipantDto {
  @IsOptional() @IsUUID() petId?: string;
  @IsOptional() @IsUUID() userId?: string;
}

@Controller("pets/:petId/trips/:tripId")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class TripExtrasController {
  constructor(private readonly extras: TripExtrasService) {}

  @Get("checklist")
  @RequirePetAccess("canViewIdentity")
  checklist(@Param("petId", ParseUUIDPipe) petId: string, @Param("tripId", ParseUUIDPipe) tripId: string) {
    return this.extras.checklist(petId, tripId);
  }

  @Post("checklist/defaults")
  @RequirePetAccess("canEditIdentity")
  defaults(@Param("petId", ParseUUIDPipe) petId: string, @Param("tripId", ParseUUIDPipe) tripId: string, @CurrentUser() user: SessionUser) {
    return this.extras.addDefaults(petId, tripId, user.locale);
  }

  @Post("checklist")
  @RequirePetAccess("canEditIdentity")
  addItem(@Param("petId", ParseUUIDPipe) petId: string, @Param("tripId", ParseUUIDPipe) tripId: string, @Body() dto: AddChecklistItemDto) {
    return this.extras.addItem(petId, tripId, dto.label, dto.category ?? "OTHER");
  }

  @Patch("checklist/:itemId")
  @RequirePetAccess("canEditIdentity")
  setDone(@Param("petId", ParseUUIDPipe) petId: string, @Param("tripId", ParseUUIDPipe) tripId: string, @Param("itemId", ParseUUIDPipe) itemId: string, @Body() dto: SetDoneDto) {
    return this.extras.setDone(petId, tripId, itemId, dto.done);
  }

  @Delete("checklist/:itemId")
  @RequirePetAccess("canEditIdentity")
  removeItem(@Param("petId", ParseUUIDPipe) petId: string, @Param("tripId", ParseUUIDPipe) tripId: string, @Param("itemId", ParseUUIDPipe) itemId: string) {
    return this.extras.removeItem(petId, tripId, itemId);
  }

  @Get("participants")
  @RequirePetAccess("canViewIdentity")
  participants(@Param("petId", ParseUUIDPipe) petId: string, @Param("tripId", ParseUUIDPipe) tripId: string) {
    return this.extras.participants(petId, tripId);
  }

  @Post("participants")
  @RequirePetAccess("canEditIdentity")
  addParticipant(@Param("petId", ParseUUIDPipe) petId: string, @Param("tripId", ParseUUIDPipe) tripId: string, @Body() dto: AddParticipantDto) {
    return this.extras.addParticipant(petId, tripId, dto);
  }

  @Delete("participants/:participantId")
  @RequirePetAccess("canEditIdentity")
  removeParticipant(@Param("petId", ParseUUIDPipe) petId: string, @Param("tripId", ParseUUIDPipe) tripId: string, @Param("participantId", ParseUUIDPipe) participantId: string) {
    return this.extras.removeParticipant(petId, tripId, participantId);
  }
}
