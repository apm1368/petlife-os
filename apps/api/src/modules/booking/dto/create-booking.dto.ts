import { IsEnum, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { PetAccessScopePreset } from "@petlife/types";

export class CreateBookingDto {
  @IsUUID()
  holdId!: string;

  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reasonForVisit?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  ownerNotes?: string;

  /** Defaults to a sensible per-category preset (see DEFAULT_SCOPE_PRESET_BY_CATEGORY) when omitted — never "full record". */
  @IsOptional()
  @IsEnum(PetAccessScopePreset)
  accessSelection?: PetAccessScopePreset;

  /** Required when the service's LocationMode is AT_CUSTOMER/MOBILE (the service address) or TRANSPORT (the pickup address). */
  @IsOptional()
  @IsUUID()
  customerAddressId?: string;

  /** TRANSPORT (pet taxi) only — the dropoff address. */
  @IsOptional()
  @IsUUID()
  dropoffAddressId?: string;
}
