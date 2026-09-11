import { IsArray, IsBooleanString, IsDateString, IsEnum, IsInt, IsNumberString, IsOptional, IsString, Min } from "class-validator";
import { PetMemoryType, PetMemoryVisibility } from "@prisma/client";

export class CreatePetMemoryDto {
  @IsEnum(PetMemoryType)
  type!: PetMemoryType;

  /** Optional — the "quick entry" flow (spec: "What happened today?") never forces a title. */
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaObjectKeys?: string[];

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsEnum(PetMemoryVisibility)
  visibility?: PetMemoryVisibility;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdatePetMemoryDto {
  @IsOptional()
  @IsEnum(PetMemoryType)
  type?: PetMemoryType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaObjectKeys?: string[];

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/**
 * spec: "owners should be able to find memories by text, date, tag, year" —
 * all optional query filters over the caller's own already-authorized pet;
 * `includeArchived` defaults to false so an archived memory never resurfaces
 * in the normal diary list.
 */
export class ListPetMemoriesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsNumberString()
  year?: string;

  @IsOptional()
  @IsBooleanString()
  includeArchived?: string;
}

export class RequestPetMemoryMediaUploadDto {
  @IsString()
  contentType!: string;

  @IsInt()
  @Min(1)
  fileSizeBytes!: number;

  @IsEnum(PetMemoryVisibility)
  visibility!: PetMemoryVisibility;
}
