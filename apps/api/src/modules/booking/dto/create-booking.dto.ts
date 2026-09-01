import { IsEnum, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { HealthAccessScopePreset } from "@petlife/types";

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

  /** Defaults to HEALTH_BASICS (see spec section 21) when omitted — never "full health record". */
  @IsOptional()
  @IsEnum(HealthAccessScopePreset)
  healthAccessSelection?: HealthAccessScopePreset;
}
