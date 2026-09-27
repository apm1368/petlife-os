import { ProviderResourceType } from "@prisma/client";
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from "class-validator";

export class CreateServiceVariantDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  priceAmount?: number | null;

  @IsInt()
  @Min(5)
  @Max(24 * 60)
  durationMinutes!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  sortOrder?: number;
}

export class UpdateServiceVariantDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) priceAmount?: number | null;
  @IsOptional() @IsInt() @Min(5) @Max(24 * 60) durationMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateResourceDto {
  @IsUUID()
  locationId!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEnum(ProviderResourceType)
  type!: ProviderResourceType;
}

export class UpdateResourceDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SetStaffServicesDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  serviceIds!: string[];
}

export class UpdateStaffProfileDto {
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000) publicBio?: string | null;
  @IsOptional() @IsBoolean() isBookable?: boolean;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(120) displayTitle?: string | null;
}

export class RespondReviewDto {
  @IsString()
  @MaxLength(2000)
  response!: string;
}
