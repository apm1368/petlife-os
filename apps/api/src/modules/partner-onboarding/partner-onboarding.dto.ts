import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";

/** Service kinds a partner can pick at signup (a shop is chosen separately). */
export const PARTNER_SERVICE_KINDS = ["VET_CLINIC", "VETERINARIAN", "GROOMER", "BOARDING", "SITTER", "TRAINER", "WALKER", "PET_TAXI"] as const;
export type PartnerServiceKind = (typeof PARTNER_SERVICE_KINDS)[number];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class StartPartnerOnboardingDto {
  @IsArray() @ArrayMaxSize(PARTNER_SERVICE_KINDS.length) @IsIn(PARTNER_SERVICE_KINDS, { each: true }) serviceKinds!: PartnerServiceKind[];
  @IsBoolean() shop!: boolean;
  @IsString() @Length(2, 120) businessName!: string;
}

export class PartnerBusinessDto {
  @IsString() @Length(2, 120) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  /** The public URL returned by POST /partner-onboarding/logo-upload (checked server-side). */
  @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
}

export class PartnerUploadDto {
  @IsString() @Length(3, 100) contentType!: string;
  @Type(() => Number) @IsInt() @Min(1) fileSizeBytes!: number;
}

export class PartnerDocumentUploadDto extends PartnerUploadDto {
  @IsIn(["PROVIDER", "SELLER"]) subject!: "PROVIDER" | "SELLER";
}

export class PartnerRegisterDocumentDto extends PartnerDocumentUploadDto {
  @IsString() @Length(10, 300) objectKey!: string;
  @IsIn(["NATIONAL_ID_CARD", "LICENSE", "BUSINESS_LICENSE", "BUSINESS_REGISTRATION", "OTHER"]) kind!: "NATIONAL_ID_CARD" | "LICENSE" | "BUSINESS_LICENSE" | "BUSINESS_REGISTRATION" | "OTHER";
  @IsOptional() @IsString() expiresAt?: string;
}

export class PartnerOwnerDto {
  @IsString() @Length(1, 80) firstName!: string;
  @IsString() @Length(1, 80) lastName!: string;
  /** Business phone (landline or mobile) for the verification profile and the business card. */
  @IsString() @Matches(/^[+0-9۰-۹\s()-]{5,30}$/) phone!: string;
}

export class PartnerAddressDto {
  @IsString() @Length(2, 60) province!: string;
  @IsString() @Length(2, 80) city!: string;
  @IsString() @Length(5, 300) addressLine!: string;
  @IsOptional() @Matches(/^[0-9۰-۹]{10}$/) postalCode?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
}

export class PartnerDayHoursDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(6) dayOfWeek!: number;
  @Matches(HHMM) start!: string;
  @Matches(HHMM) end!: string;
}

export class PartnerCalendarDto {
  @IsArray() @ArrayMaxSize(14) @ValidateNested({ each: true }) @Type(() => PartnerDayHoursDto) days!: PartnerDayHoursDto[];
}

export class PartnerServiceItemDto {
  @IsIn(PARTNER_SERVICE_KINDS) kind!: PartnerServiceKind;
  @IsString() @Length(2, 120) name!: string;
  /** Price per pet, in rials. */
  @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000_000) priceIrr!: number;
  @Type(() => Number) @IsInt() @Min(5) @Max(24 * 60) durationMinutes!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(10) maxPets!: number;
}

export class PartnerServicesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => PartnerServiceItemDto) services!: PartnerServiceItemDto[];
}

export class PartnerProductItemDto {
  @IsUUID() productVariantId!: string;
  @Type(() => Number) @IsInt() @Min(1_000) @Max(10_000_000_000) priceIrr!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100_000) stock!: number;
}

export class PartnerProductsDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PartnerProductItemDto) items!: PartnerProductItemDto[];
}
