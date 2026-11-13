import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SetPetFont, SetPetGarment, SetPetSize, SetPetZone, ShippingProvider } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateNested } from "class-validator";
import { SET_PET_COLOUR_KEYS, SET_PET_LIMITS, type SetPetDesignFileDto, type SetPetDraftDto, type SetPetOptionsDto, type SetPetRequestDto, type SetPetShippingOptionDto, type SetPetUploadTargetDto } from "@petlife/types";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { SET_PET_FILE_MAX_BYTES } from "./set-pet-files";
import { SetPetService } from "./set-pet.service";

class UploadTargetDto {
  @IsString() @Length(3, 200) filename!: string;
  @IsString() @Length(0, 100) contentType!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(SET_PET_FILE_MAX_BYTES) fileSizeBytes!: number;
}

class ItemDto {
  @IsIn(Object.values(SetPetGarment)) garment!: SetPetGarment;
  @IsIn(Object.values(SetPetSize)) size!: SetPetSize;
  @IsIn(SET_PET_COLOUR_KEYS) colour!: (typeof SET_PET_COLOUR_KEYS)[number];
  @IsOptional() @IsUUID() petId?: string | null;
  @IsOptional() @IsString() @Length(0, 60) petName?: string | null;
  @IsOptional() @IsIn(["DOG", "CAT"]) petSpecies?: "DOG" | "CAT" | null;
}

class PlacementDto {
  @IsIn(Object.values(SetPetZone)) zone!: SetPetZone;
  @IsOptional() @IsUUID() designFileId?: string | null;
  @IsOptional() @IsString() @Length(0, SET_PET_LIMITS.maxTextLength * 2) text?: string | null;
  @IsOptional() @IsIn(Object.values(SetPetFont)) font?: SetPetFont | null;
  @IsOptional() @IsIn(SET_PET_COLOUR_KEYS) textColour?: (typeof SET_PET_COLOUR_KEYS)[number] | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(SET_PET_LIMITS.minScale) @Max(SET_PET_LIMITS.maxScale) scale?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-1) @Max(1) offsetX?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-1) @Max(1) offsetY?: number;
}

class OrderDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(SET_PET_LIMITS.maxHumanGarments + SET_PET_LIMITS.maxPetGarments) @ValidateNested({ each: true }) @Type(() => ItemDto) items!: ItemDto[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => PlacementDto) placements!: PlacementDto[];
  @IsOptional() @IsUUID() forPetId?: string | null;
  @IsOptional() @IsString() @Length(0, SET_PET_LIMITS.maxNotesLength) notes?: string | null;
}

class CreateOrderDto extends OrderDto {
  /** Set when the order started as a one-click reorder. */
  @IsOptional() @IsUUID() reorderOfId?: string | null;
}

class DraftDto {
  @IsObject() data!: Record<string, unknown>;
}

class ApproveProofDto {
  /** The proof the member looked at; if staff sent a newer one meanwhile, approving fails. */
  @IsUUID() proofId!: string;
}

class ShippingQueryDto {
  @IsUUID() addressId!: string;
}

class PayDto {
  @IsUUID() addressId!: string;
  @IsIn(Object.values(ShippingProvider)) shippingProvider!: ShippingProvider;
  /** The total (IRR) the member saw; paying fails rather than charge anything else. */
  @Type(() => Number) @IsInt() @Min(1) expectedTotalIrr!: number;
}

class CancelDto {
  @IsOptional() @IsString() @Length(0, 500) reason?: string;
}

/**
 * «ست پت» for members. The options (catalogue and the live price table) are public, so the builder works before sign-in
 * (owner P4); everything else needs a session and reaches only the caller's own rows.
 */
@Controller("set-pet")
export class SetPetController {
  constructor(private readonly setPet: SetPetService) {}

  @Get("options")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  options(): Promise<SetPetOptionsDto> {
    return this.setPet.options();
  }

  // ------------------------------------------------------------------------ designs

  @Post("designs/upload-target")
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  uploadTarget(@CurrentUser() user: SessionUser, @Body() dto: UploadTargetDto): Promise<SetPetUploadTargetDto> {
    return this.setPet.uploadTarget(user.id, dto);
  }

  @Get("designs")
  @UseGuards(SessionAuthGuard)
  files(@CurrentUser() user: SessionUser): Promise<SetPetDesignFileDto[]> {
    return this.setPet.listFiles(user.id);
  }

  @Post("designs/:fileId/complete")
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  complete(@CurrentUser() user: SessionUser, @Param("fileId", ParseUUIDPipe) fileId: string): Promise<SetPetDesignFileDto> {
    return this.setPet.complete(user.id, fileId);
  }

  @Get("designs/:fileId/preview")
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  preview(@CurrentUser() user: SessionUser, @Param("fileId", ParseUUIDPipe) fileId: string) {
    return this.setPet.preview(user.id, fileId);
  }

  @Delete("designs/:fileId")
  @UseGuards(SessionAuthGuard)
  removeFile(@CurrentUser() user: SessionUser, @Param("fileId", ParseUUIDPipe) fileId: string) {
    return this.setPet.removeFile(user.id, fileId);
  }

  // ------------------------------------------------------------------------ draft (owner P5)

  @Get("draft")
  @UseGuards(SessionAuthGuard)
  async draft(@CurrentUser() user: SessionUser): Promise<{ draft: SetPetDraftDto | null }> {
    return { draft: await this.setPet.getDraft(user.id) };
  }

  @Put("draft")
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  saveDraft(@CurrentUser() user: SessionUser, @Body() dto: DraftDto): Promise<SetPetDraftDto> {
    return this.setPet.saveDraft(user.id, dto.data);
  }

  @Delete("draft")
  @UseGuards(SessionAuthGuard)
  deleteDraft(@CurrentUser() user: SessionUser) {
    return this.setPet.deleteDraft(user.id);
  }

  // ------------------------------------------------------------------------ orders

  @Post("requests")
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateOrderDto): Promise<SetPetRequestDto> {
    return this.setPet.create(user.id, dto);
  }

  @Get("requests")
  @UseGuards(SessionAuthGuard)
  list(@CurrentUser() user: SessionUser): Promise<SetPetRequestDto[]> {
    return this.setPet.list(user.id);
  }

  @Get("requests/:id")
  @UseGuards(SessionAuthGuard)
  get(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string): Promise<SetPetRequestDto> {
    return this.setPet.get(user.id, id);
  }

  @Put("requests/:id")
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  update(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: OrderDto): Promise<SetPetRequestDto> {
    return this.setPet.update(user.id, id, dto);
  }

  @Get("requests/:id/proof")
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  proof(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.setPet.proofPreview(user.id, id);
  }

  @Post("requests/:id/approve-proof")
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  approveProof(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ApproveProofDto): Promise<SetPetRequestDto> {
    return this.setPet.approveProof(user.id, id, dto.proofId);
  }

  @Get("requests/:id/shipping-options")
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  shippingOptions(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Query() query: ShippingQueryDto): Promise<SetPetShippingOptionDto[]> {
    return this.setPet.shippingOptions(user.id, id, query.addressId);
  }

  @Post("requests/:id/pay")
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  pay(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: PayDto): Promise<SetPetRequestDto> {
    return this.setPet.pay(user.id, id, dto);
  }

  @Post("requests/:id/cancel")
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  cancel(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: CancelDto): Promise<SetPetRequestDto> {
    return this.setPet.cancel(user.id, id, dto.reason);
  }

  /** Owner P40: copies the order into the builder draft; the member reviews it and sends it as a new order. */
  @Post("requests/:id/reorder")
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reorder(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string): Promise<SetPetDraftDto> {
    return this.setPet.reorder(user.id, id);
  }
}
