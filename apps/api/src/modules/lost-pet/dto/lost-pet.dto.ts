import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsISO8601, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { LostPetContactPreference } from "@petlife/types";
import { IsObjectKeyFor } from "../../../common/storage-keys/object-key.validator";

export class CreateLostPetIncidentDto {
  /** Link the pet\'s active ID-tag card (or create one with identity-only fields and in-app contact). */
  @IsOptional() @IsBoolean() exposeIdentityCard?: boolean;

  @IsString()
  @Length(1, 2000)
  description!: string;

  /** Public: approximate area only (neighbourhood / main street) — never a home address. */
  @IsOptional()
  @IsString()
  @Length(0, 120)
  publicArea?: string;

  /** Private to the household and operators. */
  @IsOptional()
  @IsString()
  @Length(0, 300)
  lastKnownLocation?: string;

  @IsOptional()
  @IsLatitude()
  lastKnownLatitude?: number;

  @IsOptional()
  @IsLongitude()
  lastKnownLongitude?: number;

  @IsOptional()
  @IsISO8601()
  lastSeenAt?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  publicNotes?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  privateNotes?: string;

  @IsOptional()
  @IsString()
  @IsObjectKeyFor(["lost-pet-photos"])
  primaryPhotoObjectKey?: string;

  @IsOptional()
  @IsEnum(LostPetContactPreference)
  contactPreference?: LostPetContactPreference;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  publicContactMode?: string;
}

/** Expose (or stop exposing) the pet's ID-tag identity card alongside an open incident. */
export class SetIncidentIdentityCardDto {
  @IsBoolean() expose!: boolean;
}

export class RequestLostPetPhotoUploadDto {
  @IsString()
  contentType!: string;

  @IsInt()
  @Min(1)
  fileSizeBytes!: number;
}

export class CloseLostPetIncidentDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}

export class SubmitLostPetSightingDto {
  @IsISO8601()
  seenAt!: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  location?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsObjectKeyFor(["lost-pet-sightings"])
  photoObjectKey?: string;

  /** Free-form limited contact the reporter chose to leave — never required, never validated as a real phone/email since an anonymous reporter may leave anything (a first name, a Telegram handle). */
  @IsOptional()
  @IsString()
  @Length(0, 200)
  reporterContactToken?: string;
}

export class RequestLostPetSightingPhotoUploadDto {
  @IsString()
  contentType!: string;

  @IsInt()
  @Min(1)
  fileSizeBytes!: number;
}

export class ReviewLostPetSightingDto {
  @IsEnum(["ACCEPTED", "REJECTED"])
  decision!: "ACCEPTED" | "REJECTED";
}

export class ListPublicLostPetsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(48) pageSize?: number;
  @IsOptional() @IsIn(["DOG", "CAT", "OTHER"]) species?: "DOG" | "CAT" | "OTHER";
}
