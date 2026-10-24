import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { CHECKLIST_CATEGORIES, TripExtrasService } from "./trip-extras.service";
import { TripPreparationService, type TripProposalKey } from "./trip-preparation.service";

class AddChecklistItemDto {
  @IsString() @Length(1, 120) label!: string;
  @IsOptional() @IsIn(CHECKLIST_CATEGORIES) category?: (typeof CHECKLIST_CATEGORIES)[number];
}
class SetDoneDto {
  @IsOptional() @IsBoolean() done?: boolean;
  @IsOptional() @IsIn(["TODO", "DONE", "NOT_REQUIRED"]) state?: "TODO" | "DONE" | "NOT_REQUIRED";
}
class ApplyProposalsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4) @IsIn(["VACCINATION_CHECK", "HEALTH_CERTIFICATE", "MEDICATION_REFILL", "PACKING"], { each: true }) keys!: TripProposalKey[];
}
class LinkDocumentDto {
  @IsUUID() documentId!: string;
}
class AddParticipantDto {
  @IsOptional() @IsUUID() petId?: string;
  @IsOptional() @IsUUID() userId?: string;
}

@Controller("pets/:petId/trips/:tripId")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class TripExtrasController {
  constructor(
    private readonly extras: TripExtrasService,
    private readonly prep: TripPreparationService,
  ) {}

  /** Chain #4: advisory readiness, rule requirements, checklist, linked documents, insurance and reminder proposals. */
  @Get("preparation")
  @RequirePetAccess("canViewIdentity")
  preparation(@Param("petId", ParseUUIDPipe) petId: string, @Param("tripId", ParseUUIDPipe) tripId: string, @CurrentUser() user: SessionUser) {
    return this.prep.preparation(petId, tripId, user.locale);
  }

  /** Creates reminders only for the proposals the member confirms. */
  @Post("reminder-proposals/apply")
  @RequirePetAccess("canEditCareProfile")
  applyProposals(@Param("petId", ParseUUIDPipe) petId: string, @Param("tripId", ParseUUIDPipe) tripId: string, @CurrentUser() user: SessionUser, @Body() dto: ApplyProposalsDto) {
    return this.prep.applyProposals(petId, tripId, user.id, user.locale, dto.keys);
  }

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
    return this.extras.setState(petId, tripId, itemId, dto);
  }

  /** Existing documents linked to the trip (references only). Health access is needed to see or link them. */
  @Get("documents")
  @RequirePetAccess("canViewHealth")
  documents(@Param("petId", ParseUUIDPipe) petId: string, @Param("tripId", ParseUUIDPipe) tripId: string, @CurrentUser() user: SessionUser) {
    return this.extras.documents(petId, tripId, user.id);
  }

  @Post("documents")
  @RequirePetAccess("canViewHealth")
  linkDocument(@Param("petId", ParseUUIDPipe) petId: string, @Param("tripId", ParseUUIDPipe) tripId: string, @Body() dto: LinkDocumentDto, @CurrentUser() user: SessionUser) {
    return this.extras.linkDocument(petId, tripId, dto.documentId, user.id);
  }

  @Delete("documents/:documentId")
  @RequirePetAccess("canViewHealth")
  unlinkDocument(@Param("petId", ParseUUIDPipe) petId: string, @Param("tripId", ParseUUIDPipe) tripId: string, @Param("documentId", ParseUUIDPipe) documentId: string, @CurrentUser() user: SessionUser) {
    return this.extras.unlinkDocument(petId, tripId, documentId, user.id);
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
