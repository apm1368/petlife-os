import { PartialType, OmitType } from "@nestjs/mapped-types";
import { IsBoolean, IsOptional, IsString, IsUUID, Length, Matches } from "class-validator";
import { IsIranLatitude, IsIranLongitude } from "../../../common/geo/geo";

export class CreateAddressDto {
  @IsUUID()
  householdId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  label?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  recipient?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  phone?: string;

  @IsString()
  @Length(1, 300)
  addressLine!: string;

  @IsString()
  @Length(1, 120)
  city!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  region?: string;

  @IsString()
  @Length(2, 2)
  countryCode!: string;

  /** Neighbourhood / district (محله). */
  @IsOptional()
  @IsString()
  @Length(1, 120)
  area?: string;

  /** The exact map pin (inside Iran). Private to the household; null on an edit removes it. */
  @IsOptional()
  @IsIranLatitude()
  latitude?: number | null;

  @IsOptional()
  @IsIranLongitude()
  longitude?: number | null;

  /** Required (true) whenever a pin is sent: the member ticked "save this exact location for deliveries". */
  @IsOptional()
  @IsBoolean()
  locationConsent?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  instructions?: string;

  @IsOptional()
  @Matches(/^[0-9]{10}$/, { message: "postalCode must be exactly 10 digits" })
  postalCode?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto extends PartialType(OmitType(CreateAddressDto, ["householdId"] as const)) {}
