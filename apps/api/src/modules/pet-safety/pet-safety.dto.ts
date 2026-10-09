import { ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from "class-validator";

export class UpsertEmergencyInfoDto {
  @IsOptional() @IsString() @MaxLength(80) contactName?: string | null;
  @IsOptional() @IsString() @Matches(/^[0-9+\-\s()]{5,20}$/) contactPhone?: string | null;
  @IsOptional() @IsString() @MaxLength(40) contactRelation?: string | null;
  @IsOptional() @IsString() @MaxLength(20) bloodType?: string | null;
  @IsOptional() @IsString() @MaxLength(500) criticalNotes?: string | null;
}

/** Fields an owner can choose to show on a public card. The pet's name is always shown; nothing else unless listed. */
export const PET_CARD_FIELDS = ["PHOTO", "SPECIES", "BREED", "SEX", "AGE", "MICROCHIP_STATUS", "ALLERGIES", "CONDITIONS", "MEDICATIONS", "BLOOD_TYPE", "CRITICAL_NOTES"] as const;
export type PetCardField = (typeof PET_CARD_FIELDS)[number];
/** Used when `fields` is omitted: identity only for an ID tag; identity + critical health for an emergency card. */
export const DEFAULT_CARD_FIELDS: Record<"EMERGENCY" | "ID_TAG", PetCardField[]> = {
  ID_TAG: ["PHOTO", "SPECIES", "BREED", "SEX", "AGE", "MICROCHIP_STATUS"],
  EMERGENCY: ["PHOTO", "SPECIES", "BREED", "SEX", "AGE", "MICROCHIP_STATUS", "ALLERGIES", "CONDITIONS", "MEDICATIONS", "BLOOD_TYPE", "CRITICAL_NOTES"],
};

export class CreateShareCardDto {
  @IsIn(["EMERGENCY", "ID_TAG"]) kind!: "EMERGENCY" | "ID_TAG";
  /** EMERGENCY: 1–720 hours (default 72). ID_TAG: optional; omitted = until revoked. */
  @IsOptional() @IsInt() @Min(1) @Max(720) expiresInHours?: number;
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(PET_CARD_FIELDS, { each: true }) fields?: PetCardField[];
  /** IN_APP (default): finders message the owner through PET LIFE. PHONE/BOTH show the emergency phone — only with phoneConsent. */
  @IsOptional() @IsIn(["IN_APP", "PHONE", "BOTH"]) contactMode?: "IN_APP" | "PHONE" | "BOTH";
  @IsOptional() @IsBoolean() phoneConsent?: boolean;
  /** Deprecated (ignored): replaced by contactMode + phoneConsent. */
  @IsOptional() @IsBoolean() includeContact?: boolean;
}

export class PetCardContactMessageDto {
  @IsString() @Length(5, 1000) message!: string;
  /** Optional: how the finder can be reached (shown to the owner only). */
  @IsOptional() @IsString() @MaxLength(120) finderContact?: string;
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
