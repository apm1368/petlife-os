import { IsEnum, IsISO8601, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, Min } from "class-validator";
import { LostPetContactPreference } from "@petlife/types";

export class CreateLostPetIncidentDto {
  @IsString()
  @Length(1, 2000)
  description!: string;

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
  primaryPhotoObjectKey?: string;

  @IsOptional()
  @IsEnum(LostPetContactPreference)
  contactPreference?: LostPetContactPreference;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  publicContactMode?: string;
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
