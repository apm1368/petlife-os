import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { PetFriendlyPlaceCategory, PetFriendlyPlaceStatus, PetSpecies } from "@petlife/types";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { IsObjectKeyFor } from "../../../common/storage-keys/object-key.validator";

export class OpeningHoursDto {
  @IsInt() @Min(0) @Max(6) day!: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) open!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) close!: string;
}

export class ReportPlaceDto {
  @IsIn(["CLOSED_PERMANENTLY", "NOT_PET_FRIENDLY", "WRONG_LOCATION", "WRONG_DETAILS", "OTHER"]) reason!: string;
  @IsOptional() @IsString() @Length(0, 1000) details?: string;
}

export class ResolvePlaceReportDto {
  @IsIn(["RESOLVED", "DISMISSED"]) status!: "RESOLVED" | "DISMISSED";
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

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

  /** Batch 5 — omit (or null) when the place has not stated it. */
  @IsOptional() @IsBoolean() leashRequired?: boolean | null;
  @IsOptional() @IsBoolean() waterAvailable?: boolean | null;
  @IsOptional() @IsBoolean() petArea?: boolean | null;
  @IsOptional() @IsBoolean() shadeAvailable?: boolean | null;
  @IsOptional() @IsBoolean() fencedArea?: boolean | null;
  @IsOptional() @IsBoolean() wasteBins?: boolean | null;
  @IsOptional() @IsBoolean() smallDogArea?: boolean | null;
  @IsOptional() @IsBoolean() parkingAvailable?: boolean | null;
  @IsOptional() @IsInt() @Min(0) entryFeeIrr?: number | null;
  @IsOptional() @IsIn(["FULL", "PARTIAL", "OUTDOOR_ONLY"]) petFriendlyLevel?: "FULL" | "PARTIAL" | "OUTDOOR_ONLY" | null;
  @IsOptional() @IsString() @Length(0, 120) province?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(14) @ValidateNested({ each: true }) @Type(() => OpeningHoursDto) openingHours?: OpeningHoursDto[] | null;
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
  @IsObjectKeyFor(["pet-friendly-places"])
  imageObjectKeys?: string[];

  @IsOptional()
  @IsString()
  @Length(0, 300)
  verificationSource?: string;

  /** Batch 5 — omit (or null) when the place has not stated it. */
  @IsOptional() @IsBoolean() leashRequired?: boolean | null;
  @IsOptional() @IsBoolean() waterAvailable?: boolean | null;
  @IsOptional() @IsBoolean() petArea?: boolean | null;
  @IsOptional() @IsBoolean() shadeAvailable?: boolean | null;
  @IsOptional() @IsBoolean() fencedArea?: boolean | null;
  @IsOptional() @IsBoolean() wasteBins?: boolean | null;
  @IsOptional() @IsBoolean() smallDogArea?: boolean | null;
  @IsOptional() @IsBoolean() parkingAvailable?: boolean | null;
  @IsOptional() @IsInt() @Min(0) entryFeeIrr?: number | null;
  @IsOptional() @IsIn(["FULL", "PARTIAL", "OUTDOOR_ONLY"]) petFriendlyLevel?: "FULL" | "PARTIAL" | "OUTDOOR_ONLY" | null;
  @IsOptional() @IsString() @Length(0, 120) province?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(14) @ValidateNested({ each: true }) @Type(() => OpeningHoursDto) openingHours?: OpeningHoursDto[] | null;
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
  /** Attribute filters: only places known to have a fenced area / small-dog area / free entry. */
  @IsOptional() @IsIn(["true"]) fencedArea?: string;
  @IsOptional() @IsIn(["true"]) smallDogArea?: string;
  @IsOptional() @IsIn(["true"]) free?: string;

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

export class SuggestPlaceDto {
  @IsString() @Length(1, 200) name!: string;
  @IsEnum(PetFriendlyPlaceCategory) category!: PetFriendlyPlaceCategory;
  @IsString() @Length(1, 80) city!: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class ReviewPlaceSuggestionDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
