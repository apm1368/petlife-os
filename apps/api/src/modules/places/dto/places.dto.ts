import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { PetFriendlyPlaceCategory, PetFriendlyPlaceStatus, PetSpecies } from "@petlife/types";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";

export class CreatePetFriendlyPlaceDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsEnum(PetFriendlyPlaceCategory)
  category!: PetFriendlyPlaceCategory;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsString()
  @Length(2, 2)
  country!: string;

  @IsString()
  @Length(1, 200)
  city!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  address?: string;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsArray()
  @IsEnum(PetSpecies, { each: true })
  speciesAllowed?: PetSpecies[];

  @IsOptional()
  @IsString()
  @Length(0, 500)
  sizeRestrictions?: string;

  @IsOptional()
  @IsBoolean()
  indoorAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  outdoorAllowed?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  petPolicy?: string;
}

export class UpdatePetFriendlyPlaceDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsEnum(PetFriendlyPlaceCategory)
  category?: PetFriendlyPlaceCategory;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  address?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(PetSpecies, { each: true })
  speciesAllowed?: PetSpecies[];

  @IsOptional()
  @IsString()
  @Length(0, 500)
  sizeRestrictions?: string;

  @IsOptional()
  @IsBoolean()
  indoorAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  outdoorAllowed?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  petPolicy?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  imageObjectKeys?: string[];

  @IsOptional()
  @IsString()
  @Length(0, 300)
  verificationSource?: string;
}

export class SetPetFriendlyPlaceVerificationStatusDto {
  @IsEnum(PetFriendlyPlaceStatus)
  status!: PetFriendlyPlaceStatus;
}

export class SetPetFriendlyPlaceListedDto {
  @IsBoolean()
  isPubliclyListed!: boolean;
}

export class RequestPetFriendlyPlaceImageUploadDto {
  @IsString()
  contentType!: string;

  @IsInt()
  @Min(1)
  fileSizeBytes!: number;
}

export class ListPetFriendlyPlacesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEnum(PetFriendlyPlaceCategory)
  category?: PetFriendlyPlaceCategory;

  @IsOptional()
  @IsEnum(PetSpecies)
  species?: PetSpecies;
}

export class NearbyPetFriendlyPlacesQueryDto extends PaginationQueryDto {
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude!: number;

  /** Search radius in meters — capped to keep a single query bounded. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100_000)
  radiusMeters?: number;

  @IsOptional()
  @IsEnum(PetFriendlyPlaceCategory)
  category?: PetFriendlyPlaceCategory;

  @IsOptional()
  @IsEnum(PetSpecies)
  species?: PetSpecies;
}
