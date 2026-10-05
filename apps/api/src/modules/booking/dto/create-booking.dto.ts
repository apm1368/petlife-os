import { Type } from "class-transformer";
import { ArrayUnique, Equals, IsArray, IsBoolean, IsEnum, IsIn, IsObject, IsOptional, IsString, IsUUID, Length, Matches, ValidateNested } from "class-validator";
import { TRANSPORT_REQUIREMENTS } from "../booking-cancellation.util";
import { PetAccessScopePreset } from "@petlife/types";

export class PickupContactDto {
  @IsString() @Length(1, 80) name!: string;
  @IsString() @Matches(/^[0-9+\-\s()]{5,20}$/) phone!: string;
  /** The member confirms this person agreed to be contacted for the pickup. */
  @IsBoolean() @Equals(true) consentConfirmed!: boolean;
}

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

  /** Answers to the service's active intake form, keyed by question key (see GET /provider-services/:id/intake-form). */
  @IsOptional()
  @IsObject()
  intakeAnswers?: Record<string, unknown>;

  /** Pet taxi only: declared ride needs. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(TRANSPORT_REQUIREMENTS, { each: true })
  transportRequirements?: (typeof TRANSPORT_REQUIREMENTS)[number][];

  /** Pet taxi only: someone else hands the pet over at pickup. */
  @IsOptional()
  @ValidateNested()
  @Type(() => PickupContactDto)
  pickupContact?: PickupContactDto;
}
