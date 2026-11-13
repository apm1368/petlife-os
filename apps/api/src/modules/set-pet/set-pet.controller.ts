import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SetPetSize, SetPetZone } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateNested } from "class-validator";
import type { SetPetDesignFileDto, SetPetOptionsDto, SetPetRequestDto, SetPetUploadTargetDto } from "@petlife/types";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { SET_PET_FILE_MAX_BYTES } from "./set-pet-files";
import { SET_PET_MAX_HUMAN_GARMENTS, SetPetService } from "./set-pet.service";

class UploadTargetDto {
  @IsString() @Length(3, 200) filename!: string;
  @IsString() @Length(0, 100) contentType!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(SET_PET_FILE_MAX_BYTES) fileSizeBytes!: number;
}

class MeasurementsDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) neckCm!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) chestCm!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 1 }) backLengthCm!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) weightKg!: number;
}

class PlacementDto {
  @IsIn(Object.values(SetPetZone)) zone!: SetPetZone;
  @IsUUID() designFileId!: string;
}

class CreateRequestDto {
  @IsOptional() @IsUUID() petId?: string;
  @IsString() @Length(1, 40) humanColour!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(SET_PET_MAX_HUMAN_GARMENTS) @IsIn(Object.values(SetPetSize), { each: true }) humanSizes!: SetPetSize[];
  @IsIn(Object.values(SetPetSize)) petSize!: SetPetSize;
  @IsString() @Length(1, 40) petColour!: string;
  @ValidateNested() @Type(() => MeasurementsDto) petMeasurements!: MeasurementsDto;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => PlacementDto) placements!: PlacementDto[];
  @IsOptional() @IsString() @Length(0, 1000) notes?: string;
}

class CancelDto {
  @IsOptional() @IsString() @Length(0, 500) reason?: string;
}

/**
 * «ست پت» for members. Designs: ask for an upload target, PUT the file, then `complete` (the server checks the bytes and
 * strips photo metadata). Requests: send, list, read, cancel, accept the quote. Only the caller's own rows are reachable.
 */
@Controller("set-pet")
@UseGuards(SessionAuthGuard)
export class SetPetController {
  constructor(private readonly setPet: SetPetService) {}

  @Get("options")
  options(): SetPetOptionsDto {
    return this.setPet.options();
  }

  @Post("designs/upload-target")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  uploadTarget(@CurrentUser() user: SessionUser, @Body() dto: UploadTargetDto): Promise<SetPetUploadTargetDto> {
    return this.setPet.uploadTarget(user.id, dto);
  }

  @Get("designs")
  looseFiles(@CurrentUser() user: SessionUser): Promise<SetPetDesignFileDto[]> {
    return this.setPet.listLooseFiles(user.id);
  }

  @Post("designs/:fileId/complete")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  complete(@CurrentUser() user: SessionUser, @Param("fileId", ParseUUIDPipe) fileId: string): Promise<SetPetDesignFileDto> {
    return this.setPet.complete(user.id, fileId);
  }

  @Get("designs/:fileId/preview")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  preview(@CurrentUser() user: SessionUser, @Param("fileId", ParseUUIDPipe) fileId: string) {
    return this.setPet.preview(user.id, fileId);
  }

  @Delete("designs/:fileId")
  removeFile(@CurrentUser() user: SessionUser, @Param("fileId", ParseUUIDPipe) fileId: string) {
    return this.setPet.removeFile(user.id, fileId);
  }

  @Post("requests")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateRequestDto): Promise<SetPetRequestDto> {
    return this.setPet.create(user.id, dto);
  }

  @Get("requests")
  list(@CurrentUser() user: SessionUser): Promise<SetPetRequestDto[]> {
    return this.setPet.list(user.id);
  }

  @Get("requests/:id")
  get(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string): Promise<SetPetRequestDto> {
    return this.setPet.get(user.id, id);
  }

  @Post("requests/:id/cancel")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  cancel(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: CancelDto): Promise<SetPetRequestDto> {
    return this.setPet.cancel(user.id, id, dto.reason);
  }

  @Post("requests/:id/accept-quote")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  acceptQuote(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string): Promise<SetPetRequestDto> {
    return this.setPet.acceptQuote(user.id, id);
  }
}
