import { ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from "class-validator";

export class UpsertEmergencyInfoDto {
  @IsOptional() @IsString() @MaxLength(80) contactName?: string | null;
  @IsOptional() @IsString() @Matches(/^[0-9+\-\s()]{5,20}$/) contactPhone?: string | null;
  @IsOptional() @IsString() @MaxLength(40) contactRelation?: string | null;
  @IsOptional() @IsString() @MaxLength(20) bloodType?: string | null;
  @IsOptional() @IsString() @MaxLength(500) criticalNotes?: string | null;
}

export class CreateShareCardDto {
  @IsIn(["EMERGENCY", "ID_TAG"]) kind!: "EMERGENCY" | "ID_TAG";
  /** EMERGENCY: 1–720 hours (default 72). ID_TAG: optional; omitted = until revoked. */
  @IsOptional() @IsInt() @Min(1) @Max(720) expiresInHours?: number;
  @IsOptional() @IsBoolean() includeContact?: boolean;
}

export const CARE_HANDOFF_SCOPES = ["BASIC_PROFILE", "CARE", "EMERGENCY_HEALTH", "BOOKINGS"] as const;
export type CareHandoffScope = (typeof CARE_HANDOFF_SCOPES)[number];

export class CreateCareHandoffDto {
  /** An existing PET LIFE account that is not a member of this pet's household. */
  @IsEmail() @MaxLength(254) email!: string;
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsIn(CARE_HANDOFF_SCOPES, { each: true }) scopes!: CareHandoffScope[];
  @IsOptional() @IsDateString() startsAt?: string;
  /** Required — a handoff always ends. At most 30 days after it starts. */
  @IsDateString() expiresAt!: string;
  @IsOptional() @IsString() @Length(1, 240) note?: string;
}
