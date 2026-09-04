import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";
import { PetMemoryType, PetMemoryVisibility } from "@prisma/client";

export class CreatePetMemoryDto {
  @IsEnum(PetMemoryType)
  type!: PetMemoryType;

  @IsString()
  title!: string;

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
